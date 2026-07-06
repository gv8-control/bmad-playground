---
baseline_commit: d357b97be3d7eef62d701ad96b5c264fa16a5a78
---

# Story 3.2: Invoke BMAD Skills via Slash Command

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user in a Conversation,
I want to browse and invoke the repository's available Skills with `/`,
so that I can run the same BMAD workflows my developer teammates run, without memorizing exact command names.

## Acceptance Criteria

### AC-1: Slash Command Picker opens on `/` (FR9, UX-DR8)

**Given** an open Conversation with a ready session
**When** the user types `/` at the start of an empty chat input
**Then** a filterable, keyboard-navigable Slash Command Picker opens as a floating dropdown anchored above the chat input, listing Skills derived from the connected repository's `.claude/skills/` directory
**And** further typing after `/` narrows the list by skill-name prefix
**And** Arrow keys move focus within the list, Enter selects the focused skill, Escape dismisses the picker
**And** selecting a skill appends the full slash command (e.g. `/bmad-prd`) to the input and focuses the input — the user may then type context or send immediately
**And** the picker is dismissed by clicking outside it or pressing Escape

### AC-2: Empty skills state

**Given** no Skills exist in the repository's `.claude/skills/` directory
**When** the picker opens
**Then** it displays "No skills found in this repository."

### AC-3: Skill selected and sent (message persistence + title)

**Given** a Skill is selected (slash command in input) and the user sends the message
**When** the message is submitted
**Then** the message (including the slash command) is persisted as a user `Turn` in Postgres
**And** the Conversation is assigned a 2–5 word semantic title derived from the first message content
**And** the idle timeout is cleared (the sandbox received its first message)

> **Scope note (DP-2):** The full agent invocation — streaming response, persona adoption, tool execution — is Story 3.3 scope. Story 3.2 wires the message-sending endpoint, persists the turn, generates the title, and transitions the URL. The agent response is NOT implemented in this story. See Decision Records.

### AC-4: URL transition and side nav on first message

**Given** a New Conversation page at `/conversations/new` with no permanent URL
**When** the first message is sent
**Then** the page transitions to `/conversations/:id` (the conversation's permanent URL)
**And** the Conversation appears in the side nav with its 2–5 word semantic title (truncated with ellipsis)
**And** the side nav shows the last 5 conversations by `lastActiveAt` descending
**And** the New Conversation page no longer exists for this session (the URL has changed)

## Tasks / Subtasks

- [x] Task 1: Extend `ISandboxService` with `listSkills` (AC: 1, 2)
  - [x] 1.1 **VERIFY (already complete in baseline):** `SkillInfo` type and `listSkills` method already exist in `libs/shared-types/src/sandbox.interface.ts` (lines 24-26, 36). `SkillInfo` is barrel-exported from `index.ts`. Confirm presence; do not re-add — re-declaring causes a duplicate-identifier compile error
  - [x] 1.2 **REPLACE the throwing stub** in `apps/agent-be/src/sandbox/sandbox.service.ts` (lines 129-131, currently `throw new Error('Not implemented — Story 3.2 Task 1.2')`) with the real implementation — execute `ls -1 .claude/skills/` inside the sandbox via `sandbox.process.executeCommand` (same pattern as `getWorkingTreeStatus` at lines 104-118). The Daytona SDK returns `{ result, exitCode }` — read `response.result` (NOT `response.stdout`; the fake's `executeCommand` uses `stdout` but production uses `result`). Parse the output: split on newlines, trim, filter empty lines. Return `{ name }[]`. If the directory doesn't exist (ls returns non-zero / "No such file"), return `[]` (not an error — AC-2 empty state). Wrap in try/catch: any command failure returns `[]` (the picker shows the empty state, not an error)
  - [x] 1.3 **VERIFY (already complete in baseline):** `SandboxServiceFake` already has `setSkills(skills: SkillInfo[])` (lines 33-36), `skills: SkillInfo[]` field (line 21), and `listSkills()` returning `this.skills` (lines 98-100). Confirm presence; do not re-add

- [x] Task 2: agent-be — skills listing endpoint (AC: 1, 2)
  - [x] 2.1 Add `GET /:id/skills` endpoint to `apps/agent-be/src/conversations/conversations.controller.ts` — returns `SkillInfo[]` (raw array, no wrapper). Guarded by global `BoundaryJwtGuard` + `ActiveUserGuard`. Calls `conversationsService.listSkills(id, user.id)`
  - [x] 2.2 **REPLACE the `listSkills` throwing stub** in `apps/agent-be/src/conversations/conversations.service.ts` (lines 168-170, currently `throw new Error('Not implemented — Story 3.2 Task 2.2')`) with the real implementation — verify conversation ownership via `findFirst({ where: { id: conversationId, userId } })` (tenant authorization check — same pattern as `getStatus`). Return `[]` if conversation not found (don't leak existence). Resolve the `sandboxId` for the conversation from `this.sandboxIds` (the Map **already exists** at line 20, populated in `provisionSandbox` at line 87, deleted in cleanup paths at lines 117 and 136 — do NOT re-add the field or these calls). If no sandboxId is tracked yet (still provisioning), return `[]` — the frontend fetches skills on `SESSION_READY`, by which point the sandboxId is tracked. Call `sandboxService.listSkills(sandboxId)` and return the result
  - [x] 2.3 **REMOVE `it.skip`** from the existing RED-phase tests in `apps/agent-be/src/conversations/conversations.service.spec.ts` (`describe('[P0] listSkills (AC-1, AC-2)')` lines 238-271, 4 tests) and make them pass — [P0] `listSkills` returns skills from the fake, [P0] `listSkills` returns `[]` for a conversation not owned by the user (tenant isolation), [P0] `listSkills` returns `[]` when sandbox is not yet provisioned, [P1] `listSkills` returns `[]` when `.claude/skills/` is empty (use `sandboxFake.setSkills([])`)

- [x] Task 3: agent-be — message sending endpoint (AC: 3, 4)
  - [x] 3.1 Create `apps/agent-be/src/conversations/dto/send-message.dto.ts` — Zod schema (via `nestjs-zod` `createZodDto`) for `POST /conversations/:id/turns` request body. Fields: `content: z.string().min(1)` (the message text, including any slash command). Export `SendMessageDto`
  - [x] 3.2 Add `POST /:id/turns` endpoint to `apps/agent-be/src/conversations/conversations.controller.ts` — accepts `SendMessageDto` via `ZodValidationPipe`. Calls `conversationsService.sendTurn(id, user.id, body.content)`. Returns `{ conversationId: string; title: string | null }` (raw body, no wrapper). Status 201
  - [x] 3.3 **REPLACE the `sendTurn` throwing stub** in `apps/agent-be/src/conversations/conversations.service.ts` (lines 172-178, currently `throw new Error('Not implemented — Story 3.2 Task 3.3')` — the return type signature `{ conversationId: string; title: string | null }` is already declared, keep it) with the real implementation:
    1. Verify conversation ownership: `findFirst({ where: { id: conversationId, userId } })` — throw 403-shaped error if not found (use `NotFoundException`-style — but per architecture, the filter maps to `{ code, message, meta }`; use a plain `Error` with a recognizable message, or NestJS `NotFoundException`). Actually: return a not-found result so the controller can 404 — but the architecture says controllers throw and the filter catches. Throw `new NotFoundException('Conversation not found')` (NestJS built-in — the `HttpExceptionFilter` maps it to the error envelope). Import `NotFoundException` from `@nestjs/common`
    2. Clear the idle timeout: call `this.onFirstMessage(conversationId)` (reuses the existing method from Story 3.1 which calls `idleTimeout.clearTimer` — the sandbox received its first message, AC-3)
    3. Persist the user turn: `this.prisma.turn.create({ data: { conversationId, role: 'user', content } })`
    4. Generate the semantic title if `conversation.title` is null (first message): call `generateSemanticTitle(content)` — extract the first 2-5 words from the content (split on whitespace, take up to 5 words, join with space, strip any leading `/` from the first word so slash commands don't appear in the title). Update the conversation: `this.prisma.conversation.update({ where: { id: conversationId }, data: { title, lastActiveAt: new Date() } })`
    5. Return `{ conversationId, title }`
  - [x] 3.4 Add `generateSemanticTitle(content: string): string` private method to `ConversationsService` — implementation: strip leading `/`, split on whitespace, take first 5 words, join with space, truncate to 60 chars with ellipsis if longer. This is a simple heuristic (DP-3 — simplest reversible option). An LLM-generated title can replace it in Story 3.3 when the agent is available. Export as a pure function in `apps/agent-be/src/conversations/semantic-title.ts` so it's testable in isolation
  - [x] 3.5 Create `apps/agent-be/src/conversations/semantic-title.spec.ts` — [P0] extracts first 2-5 words, [P0] strips leading `/` from slash commands, [P0] truncates long content with ellipsis at 60 chars, [P1] handles empty/whitespace-only content (returns "New Conversation" fallback)
  - [x] 3.6 **REMOVE `it.skip`** from the existing RED-phase tests in `apps/agent-be/src/conversations/conversations.service.spec.ts` (`describe('[P0] sendTurn (AC-3)')` lines 273-349, 6 tests) and make them pass — [P0] `sendTurn` persists a user turn with the correct content, [P0] `sendTurn` clears the idle timeout, [P0] `sendTurn` generates and persists a semantic title on first message, [P0] `sendTurn` does not overwrite an existing title on subsequent messages, [P0] `sendTurn` throws `NotFoundException` for a conversation not owned by the user, [P1] `sendTurn` updates `lastActiveAt`. Note: the mock Prisma in `beforeEach` ALREADY includes `conversation.update` (line 37) and `turn.create` (lines 39-41) — do not re-add them

- [x] Task 4: Frontend — Slash Command Picker component (AC: 1, 2)
  - [x] 4.1 **REPLACE the no-op stub** in `apps/web/src/components/conversation/SlashCommandPicker.tsx` (currently returns `null`) with the real implementation — `'use client'` Client Component. Props: `{ skills: SkillInfo[]; query: string; selectedIndex: number; onSelect: (skill: SkillInfo) => void; onDismiss: () => void }`. Renders a floating dropdown anchored above the chat input (absolute positioning, `bottom-full` relative to the input container). Each item: skill name in `sm` weight medium, left-padded at `12px`. Hovered/focused item: `bg-surface-raised` highlight. Container: `border border-border rounded-lg` outline, `min-w-[240px]`, `max-h-[320px] overflow-y-auto`. Empty state: "No skills found in this repository." in `text-text-3 text-sm`. The component is presentational — the parent owns query state, selected index, and keyboard handling. Items have `role="option"`, the list has `role="listbox"`. Use `cn()` for class merging. Focus ring: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` on each item
  - [x] 4.2 **REMOVE `it.skip`** from the existing RED-phase tests in `apps/web/src/components/conversation/SlashCommandPicker.test.tsx` (4 tests) and make them pass — [P0] renders all skills passed as props, [P0] highlights the item at `selectedIndex`, [P0] shows "No skills found in this repository." when skills array is empty, [P0] calls `onSelect` when an item is clicked, [P1] filters skills by query prefix (if filtering is done in the picker — but filtering is done by the parent, so this test belongs to the parent). Use `@jest-environment jsdom`

- [x] Task 5: Frontend — integrate slash command picker into ConversationPane (AC: 1, 2, 3, 4)
  - [ ] 5.1 Update `apps/web/src/components/conversation/ConversationPane.tsx`:
    - Add `conversationId` to the component state (already exists but unused — wire it)
    - Add skills fetching: on `SESSION_READY`, fetch skills via `GET {apiUrl}/api/conversations/{conversationId}/skills` with `Authorization: Bearer {boundaryJwt}`. Store in state `skills: SkillInfo[]`. If the fetch fails or returns empty, the picker shows the empty state
    - Add slash command picker state: `pickerOpen: boolean`, `pickerQuery: string` (the text after `/`), `pickerSelectedIndex: number`
    - Add input change handler: if the input value is `/` followed by non-whitespace (or just `/` at start), open the picker and set `pickerQuery` to the text after `/`. If the input no longer starts with `/`, close the picker
    - Add keyboard handler for the input: when picker is open — `ArrowDown`/`ArrowUp` move `pickerSelectedIndex` (wrap around), `Enter` selects the focused skill (appends `/{skill.name} ` to the input, closes the picker, focuses the input), `Escape` closes the picker (returns focus to input, keeps the `/` text). When picker is closed — `Enter` submits the message (existing behavior). Prevent default on Arrow/Escape/Enter-when-picker-open to avoid browser defaults
    - When a skill is selected: set input to `/{skill.name} `, close the picker, focus the input (the user may then type context or send immediately — per UX spec; the auto-growing textarea is Story 3.3 scope)
    - Render `<SlashCommandPicker>` above the form when `pickerOpen` is true, passing filtered skills (filter `skills` by `pickerQuery` prefix), `pickerSelectedIndex`, `onSelect`, `onDismiss`
    - Add outside-click handler: when picker is open, a click outside the picker or input closes the picker (use a `ref` on the picker+input container and a `mousedown` listener)
  - [ ] 5.2 Wire message sending in `sendMessage(message: string)`:
    - Call `POST {apiUrl}/api/conversations/{conversationId}/turns` with `Authorization: Bearer {boundaryJwt}`, body `{ content: message }`
    - On success: receive `{ conversationId, title }`. If this is a new conversation (no `initialConversationId` prop was passed — the `ConversationPane` was mounted on `/conversations/new`), transition to `/conversations/{conversationId}` via `router.push()` (use `useRouter` from `next/navigation`). This avoids importing `usePathname` — the `initialConversationId` prop already distinguishes new vs existing conversations. Clear the input. Clear the `localStorage` draft (key `new-conversation-draft`)
    - On error: surface a user-facing error message (keep the input text so the user can retry). Use the `try/finally` pattern if a side effect must run regardless — but here the error is surfaced in state, so `try/catch` is appropriate (this is NOT a `useTransition` call — it's a direct `fetch` from a Client Component, so errors are caught normally)
    - Note: the agent response streaming AND chat history rendering are Story 3.3 scope. Story 3.2 only persists the user's message and transitions the URL. After the URL transition, the new `/conversations/:id` page mounts a fresh `ConversationPane` — the chat area is empty (no message history rendered yet). This is acceptable for Story 3.2 — the full chat experience (message history, streaming responses) is Story 3.3
  - [ ] 5.3 **REMOVE `it.skip`** from the existing RED-phase tests in `apps/web/src/components/conversation/ConversationPane.test.tsx` (lines 246-458, 8 tests) and make them pass — [P0] opens picker on `/` at start of empty input, [P0] filters skills by query prefix, [P0] ArrowDown/ArrowUp moves focus in picker, [P0] Enter in picker selects skill and appends `/{name} ` to input, [P0] Escape closes picker, [P0] shows "No skills found in this repository." when no skills, [P0] sends message via POST /turns on Enter (when picker closed), [P0] transitions URL to /conversations/:id on first message send, [P1] closes picker on outside click. Mock `fetch` and `EventSource` (existing mock pattern). Mock `useRouter` via `jest.mock('next/navigation', ...)`

- [x] Task 6: Frontend — Conversation page at `/conversations/:id` (AC: 4)
  - [ ] 6.1 Create `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx` — Server Component. Reads `conversationId` from params (Next.js 16: `params: Promise<{ conversationId: string }>` — await it). Call `auth()` for `userId`. If no session, return `null as never` after `redirect('/sign-in')`. Mint boundary JWT. Read the conversation from Postgres via `getPrisma().conversation.findFirst({ where: { id: conversationId, userId } })` — if not found, `redirect('/conversations/new')` and `return null as never`. Render `<Breadcrumb />`, `<h1>{conversation.title ?? 'Conversation'}</h1>`, and `<ConversationPane boundaryJwt={...} apiUrl={...} conversationId={conversationId} />`. Pass `conversationId` as a prop so `ConversationPane` can send turns without waiting for the create-conversation response. The page does NOT create a new conversation (unlike `/conversations/new`) — the conversation already exists. The `ConversationPane` on this route should NOT call `POST /api/conversations` on mount (it already has a `conversationId`). This requires a prop to distinguish the two modes: add `initialConversationId?: string` prop to `ConversationPane` — if provided, skip the create-conversation call and use the provided ID directly; if not provided (New Conversation page), call `POST /api/conversations` on mount as before
  - [ ] 6.2 Update `apps/web/src/components/conversation/ConversationPane.tsx` — accept `initialConversationId?: string` prop. If provided: set `conversationId` state to it immediately, open the SSE connection to `/api/conversations/{initialConversationId}/events`, skip the `POST /api/conversations` call. If not provided: existing behavior (create conversation on mount). This makes `ConversationPane` reusable for both new and existing conversations
  - [ ] 6.3 Create `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/loading.tsx` — skeleton with `<h1>Conversation</h1>` (route-focus management) and a simple placeholder. Match the `project-map/loading.tsx` pattern
  - [ ] 6.4 Create `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/error.tsx` — Client Component error boundary with `<h1>Conversation</h1>`, centered message, Refresh button. Follow `project-map/error.tsx` pattern (do NOT import `Breadcrumb` — it's a Server Component)

- [x] Task 7: Frontend — side nav conversation list (AC: 4)
  - [ ] 7.1 Update `apps/web/src/app/(dashboard)/(app)/layout.tsx` — fetch the last 5 conversations for the user: `getPrisma().conversation.findMany({ where: { userId, title: { not: null } }, orderBy: { lastActiveAt: 'desc' }, take: 5, select: { id: true, title: true } })`. Pass as `conversations` prop to `<AppShell>`. This runs on every navigation through the layout (the layout already fetches `repoConnection` — same pattern). The `title: { not: null }` filter ensures conversations with no title (created but no first message yet) don't appear in the side nav (per Story 3.1 decision: "Story 3.2 populates it — conversations appear in side nav on first message send, when they get a semantic title")
  - [ ] 7.2 Update `apps/web/src/components/shell/AppShell.tsx` — accept `conversations: { id: string; title: string | null }[]` prop. Pass to `<SideNavigation>` (both desktop and mobile drawer instances)
  - [ ] 7.3 Update `apps/web/src/components/shell/SideNavigation.tsx` — accept `conversations: { id: string; title: string | null }[]` prop. Render the conversation list in the existing `data-testid="conversation-list"` div. Each conversation: a `<Link href="/conversations/{id}">` with the title (truncated with ellipsis via `truncate` CSS or `text-ellipsis overflow-hidden whitespace-nowrap`). Active state: `bg-surface-raised text-text-1` when `pathname === /conversations/{id}`. Inactive: `text-text-2 hover:bg-surface-raised`. Focus ring: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`. Filter out conversations with `null` title (defensive — the query already filters, but the type allows null)
  - [ ] 7.4 Update `apps/web/src/components/shell/AppShell.tsx` test (if exists) or create `SideNavigation.test.tsx` — [P0] renders conversation titles as links, [P0] highlights the active conversation, [P0] shows no conversation list items when conversations array is empty

- [x] Task 8: Verify lint, typecheck, and tests pass (AC: all)
  - [x] 8.1 Run `yarn nx lint agent-be` — 0 errors
  - [x] 8.2 Run `yarn nx lint web` — 0 new errors/warnings (baseline: 0 errors, 7 warnings per Story 2.6)
  - [x] 8.3 Run `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` — clean
  - [x] 8.4 Run `npx tsc --noEmit -p apps/web/tsconfig.json` — clean
  - [x] 8.5 Run `yarn nx test agent-be` — all unit + integration tests pass
  - [x] 8.6 Run `yarn nx test web` — all tests pass (baseline: 485 tests per Story 3.1)

## Dev Notes

### Decision Records

**Decision (DP-2):** AC-3 states "the Agent invokes that Skill within the current Conversation, taking on its defined persona." However, agent execution (streaming response, persona adoption, tool execution via Claude Agent SDK) is explicitly Story 3.3 scope ("Converse with the Streaming Agent"). The two stories are sequential: Story 3.2 wires the slash command picker, message-sending endpoint, URL transition, and side nav; Story 3.3 adds the streaming agent response. Per DP-2, followed the semantic intent over the literal text — Story 3.2 persists the user's message (including the slash command) as a Turn and generates the semantic title. The actual agent invocation is Story 3.3. The message-sending endpoint (`POST /conversations/:id/turns`) persists the turn and returns the conversation ID + title so the frontend can transition the URL. The backend has no concept of a "selected skill" — per the architecture research: "Skill dispatch is conversational — the UI reads the skills list from the paused sandbox filesystem and surfaces them as suggestions; the user's first message (e.g. `/bmad-agent-pm`) invokes the skill naturally through the agent loop. The backend has no concept of a 'selected skill.'" Story 3.3 will wire the agent loop that consumes the slash command.

**Decision (DP-3):** Skills are read from the sandbox filesystem via a new `listSkills(sandboxId)` method on `ISandboxService`. This follows the architecture/research guidance: "the paused sandbox filesystem can be read immediately via the Daytona SDK to populate the skills list in the chat UI, with no separate GitHub API call needed." The implementation uses `sandbox.process.executeCommand('ls -1 .claude/skills/')` — the same pattern as `getWorkingTreeStatus` (which runs `git status --porcelain`). This is the simplest reversible option: no new GitHub API call, no new dependency, the skills are already in the cloned repo. The `SkillInfo` type is minimal: `{ name: string }` (the directory name). If the directory doesn't exist or is empty, return `[]` (the picker shows the empty state, not an error).

**Decision (DP-3):** The semantic title is derived from the first 2-5 words of the first user message content (simple heuristic), NOT an LLM call. The architecture says "2–5 word semantic title derived from its content" but does not specify the derivation mechanism. Since the agent is not available in Story 3.2 (agent execution is Story 3.3), the simplest reversible approach is a word-count heuristic: strip any leading `/` (so slash commands don't appear in the title), split on whitespace, take the first 5 words, join with space, truncate to 60 chars with ellipsis. An LLM-generated title can replace it in Story 3.3 when the agent is available — the `title` column is already nullable and updatable. The heuristic is extracted as a pure function in `semantic-title.ts` for testability.

**Decision (DP-3):** The conversation list in the side nav is fetched via a Server Component Prisma read in the `(app)/layout.tsx`. The layout already fetches `repoConnection` on every navigation — adding a conversation list query is the same pattern. The list is passed as a prop to `AppShell` → `SideNavigation`. On the URL transition from `/conversations/new` to `/conversations/:id` (first message send), the navigation triggers the layout to re-render (Server Component), and the conversation list updates with the new conversation. This follows the architecture's "no automatic client-side revalidation anywhere — manual browser reload picks up fresh server-rendered state" — the URL transition IS the navigation that picks up fresh state. No React Query/SWR, no client-side fetching. Per DP-3, this is the simplest reversible option — no new endpoint, no new client-side state management.

**Decision (DP-3):** The `ConversationPane` is made reusable for both new and existing conversations via an `initialConversationId?: string` prop. If provided (existing conversation at `/conversations/:id`), skip the `POST /api/conversations` call and use the provided ID directly. If not provided (New Conversation at `/conversations/new`), call `POST /api/conversations` on mount as before. This is the simplest reversible option — no separate component, no conditional rendering at the page level. The `/conversations/:id` page reads the conversation from Postgres (Server Component) and passes the ID to `ConversationPane`.

**Decision (DP-5):** The full chat input (auto-growing textarea 52px–200px, Enter to send, Shift+Enter for newline) is Story 3.3 scope (FR-10, UX-DR3). Story 3.2 keeps the minimal text input from Story 3.1 but adds the slash command picker integration. The auto-growing textarea, multi-line handling, and Send button as secondary affordance are Story 3.3. Per DP-5, defer scope temptation.

**Decision (DP-5):** The streaming agent response (token streaming, Markdown rendering, thinking indicator, tool execution indicator) is Story 3.3 scope. Story 3.2 persists the user's message and transitions the URL, but the user will not see an agent response. This is acceptable for Story 3.2 — the full chat experience is Story 3.3. Per DP-5, defer scope temptation.

**Decision (DP-5):** The blocked entry states (conversation limit reached, seat limit exceeded) specified in EXPERIENCE.md are NOT implemented in Story 3.2. The conversation limit (10 max) is Story 3.11 scope. The seat limit is post-MVP billing. Per DP-5, defer scope temptation.

**Decision (DP-5):** The conversation list page at `/conversations` (FR-11, architecture line 486: `page.tsx # conversation list`) is NOT created in Story 3.2. The side nav shows the last 5 conversations — that's the MVP conversation list. A dedicated conversation list page is not in any Epic 3 story's ACs. Per DP-5, defer scope temptation.

**Decision (DP-2):** AC-1 and Tasks 5.1 referenced "focuses the textarea" (quoting UX EXPERIENCE.md line 123), but Story 3.2 keeps the `<input type="text">` from Story 3.1 (the auto-growing textarea is DP-5 deferred to Story 3.3). The literal "textarea" contradicts the "keeps the minimal text input" scope. Per DP-2, followed the semantic intent (focus the chat input field) and amended the story wording to "input" so the contradiction is resolved on record. The UX spec's "textarea" is the target end-state for Story 3.3; Story 3.2 uses "input" consistently.

**Decision (DP-4):** Task 1.2 clarified the Daytona SDK `executeCommand` return shape: production returns `{ result, exitCode }` (read `response.result`), while `SandboxServiceFake.executeCommand` returns `{ stdout, exitCode }`. The "same pattern as `getWorkingTreeStatus`" hint was retained but the explicit field name was added because the fake's divergent shape could lead the dev to use `response.stdout` in production code. Artifact-only wording clarification constraining implementation — recorded per DP-4.

**Decision (DP-4):** Task 3.6 originally stated the mock Prisma in `conversations.service.spec.ts` `beforeEach` only wires `conversation.create/findUnique/findFirst` and required extending with `conversation.update` and `turn.create`. Validation found both are ALREADY mocked (lines 37, 39-41). The task was reworded to "do not re-add" — artifact-only wording correction recorded per DP-4.

**Decision (DP-3):** Task 5.2's URL-transition guard changed from "if the current URL is `/conversations/new`" (requires importing `usePathname`) to "if no `initialConversationId` prop was passed" (the prop already distinguishes new vs existing conversations). Per DP-3, the simplest reversible option — no new import, no URL parsing, the prop is the single source of truth for conversation mode.

**Decision (DP-2):** Validation found the baseline commit (`d357b97`) was pre-seeded with Story 3.2 scaffolding that the original "What Already Exists" section did not document: `SkillInfo`/`listSkills` on `ISandboxService` (Task 1.1 — fully complete), `SandboxServiceFake.setSkills()`/`listSkills()`/`skills` field (Task 1.3 — fully complete), throwing stubs for `SandboxService.listSkills`/`ConversationsService.listSkills`/`ConversationsService.sendTurn` (Tasks 1.2, 2.2, 3.3), the `sandboxIds` Map with set/delete calls (Task 2.2 sub-bullet), a no-op `SlashCommandPicker.tsx` stub (Task 4.1), and RED-phase `it.skip` tests in three spec files (Tasks 2.3, 3.6, 4.2, 5.3). The story's "add"/"create" wording contradicted the codebase state — a dev following it verbatim would re-declare existing members (duplicate-declaration compile errors) and author tests from scratch instead of removing `it.skip`. Per DP-2, followed the semantic intent (don't recreate what exists) and amended the story: added a "Pre-Seeded Scaffolding (Baseline State)" subsection documenting every pre-existing artifact with line numbers, and reworded Tasks 1.1, 1.2, 1.3, 2.2, 2.3, 3.3, 3.6, 4.1, 4.2, 5.3 from "add"/"create"/"implement" to "verify"/"replace stub"/"remove `it.skip`". The contradiction is now resolved on record.

**Decision (DP-4):** Validation corrected two citation errors in the References section: (1) DESIGN.md "lines 51-53" for side nav styling was wrong (those lines are typography weights) — corrected to lines 307-319 (prose) and 66-69 (front-matter); (2) added `min-w-[240px]` (DESIGN.md line 156) and `min-width: 240px` to the SlashCommandPicker container spec in Task 4.1, which was omitted from the original Tailwind class guidance. Artifact-only wording corrections, recorded per DP-4.

**Decision (DP-3):** The `localStorage` draft key is `new-conversation-draft` in the codebase (`ConversationPane.tsx` lines 153-169), but EXPERIENCE.md line 231 specifies `new-conversation`. The story originally attributed the key to "Established pattern from Story 3.1" — inaccurate, since Story 3.1's file says `new-conversation` while the code uses `new-conversation-draft`. Per DP-3, the simplest reversible option is to keep the codebase's existing key (`new-conversation-draft`) — changing it would orphan existing drafts for no functional benefit, and the key name is arbitrary as long as it's consistent. The attribution was corrected and the UX-spec discrepancy recorded as a deferred finding (see Deferred Findings).

### What Already Exists (Do Not Recreate)

#### Pre-Seeded Scaffolding (Baseline State)

The baseline commit (`d357b97`) was pre-seeded with Story 3.2 scaffolding — interfaces, throwing stubs, fake control hooks, and RED-phase `it.skip` tests. These exist to enforce the ATDD red→green cycle and contract shape. **Do not re-declare, re-add, or author from scratch** — replace stubs with real implementations and remove `it.skip` wrappers. Re-declaring an existing class member or interface causes a duplicate-declaration compile error.

- **`SkillInfo` type + `listSkills` on `ISandboxService`** (`libs/shared-types/src/sandbox.interface.ts` lines 24-26, 36) — **ALREADY COMPLETE** (Task 1.1). `SkillInfo` is barrel-exported from `libs/shared-types/src/index.ts`. Verify presence; do not re-add
- **`SandboxServiceFake.listSkills` + `setSkills()` + `skills` field** (`apps/agent-be/test/helpers/sandbox-service.fake.ts` lines 21, 33-36, 98-100) — **ALREADY COMPLETE** (Task 1.3). Verify presence; do not re-add
- **`SandboxService.listSkills` throwing stub** (`apps/agent-be/src/sandbox/sandbox.service.ts` lines 129-131) — throws `Error('Not implemented — Story 3.2 Task 1.2')`. **REPLACE** the stub body with the real `ls -1 .claude/skills/` implementation (Task 1.2)
- **`ConversationsService.listSkills` throwing stub** (`apps/agent-be/src/conversations/conversations.service.ts` lines 168-170) — throws `Error('Not implemented — Story 3.2 Task 2.2')`. **REPLACE** the stub body (Task 2.2)
- **`ConversationsService.sendTurn` throwing stub** (`apps/agent-be/src/conversations/conversations.service.ts` lines 172-178) — throws `Error('Not implemented — Story 3.2 Task 3.3')`. Return type signature `{ conversationId: string; title: string | null }` is already declared. **REPLACE** the stub body (Task 3.3)
- **`ConversationsService.sandboxIds` Map** (`apps/agent-be/src/conversations/conversations.service.ts` line 20) — **ALREADY COMPLETE**: field declared, populated in `provisionSandbox` (line 87 `this.sandboxIds.set(conversationId, sandboxId)`), and deleted in both cleanup paths (idle-timeout line 117, error line 136). Do NOT re-add the field or the set/delete calls — this causes a duplicate-declaration compile error
- **`SlashCommandPicker.tsx` no-op stub** (`apps/web/src/components/conversation/SlashCommandPicker.tsx`) — returns `null`. **REPLACE** with the real implementation (Task 4.1)
- **`SlashCommandPicker.test.tsx` RED-phase tests** (`apps/web/src/components/conversation/SlashCommandPicker.test.tsx`) — 4 `it.skip` tests. **REMOVE `it.skip`** and make them pass (Task 4.2)
- **`conversations.service.spec.ts` RED-phase tests** (`apps/agent-be/src/conversations/conversations.service.spec.ts`) — `describe('[P0] listSkills (AC-1, AC-2)')` (lines 238-271, 4 `it.skip`) and `describe('[P0] sendTurn (AC-3)')` (lines 273-349, 6 `it.skip`). **REMOVE `it.skip`** and make them pass (Tasks 2.3, 3.6). The mock Prisma in `beforeEach` ALREADY includes `conversation.update` (line 37) and `turn.create` (lines 39-41) — do not re-add
- **`ConversationPane.test.tsx` RED-phase tests** (`apps/web/src/components/conversation/ConversationPane.test.tsx` lines 246-458) — 8 `it.skip` tests for picker integration and message sending. **REMOVE `it.skip`** and make them pass (Task 5.3)

#### Story 3.1 Deliverables (Foundational)

- **`Conversation` and `Turn` Prisma models** (`libs/database-schemas/src/prisma/schema.prisma`) — Story 3.1 added these. `Conversation` has `id`, `userId`, `title` (nullable), `lastActiveAt`, `createdAt`, `updatedAt`. `Turn` has `id`, `conversationId`, `role`, `content`, `createdAt`. The `@@index([userId, lastActiveAt])` on Conversation supports the side nav "last 5 conversations" query. The `@@index([conversationId, createdAt])` on Turn supports ordered history retrieval. Do NOT modify the schema — no migration needed for Story 3.2
- **`ConversationPane` Client Component** (`apps/web/src/components/conversation/ConversationPane.tsx`) — Story 3.1 delivered this. Manages the session-start lifecycle (init → provisioning → ready/error/timeout), calls `POST /api/conversations` on mount, opens EventSource for SSE, has a minimal text input + send button. Story 3.2 EXTENDS this component — adds slash command picker integration, message sending, and URL transition. Do NOT rewrite — extend
- **`SessionStartSpinner`** (`apps/web/src/components/conversation/SessionStartSpinner.tsx`) — Story 3.1 delivered this. Presentational component for the "Starting session…" spinner. Do NOT modify
- **`ConversationsService`** (`apps/agent-be/src/conversations/conversations.service.ts`) — Story 3.1 delivered this. Has `createConversation`, `provisionSandbox`, `onFirstMessage`, `getStatus`. Story 3.2 adds `listSkills` and `sendTurn`. The `onFirstMessage` method (clears idle timeout) is already wired but not yet called from any endpoint — Story 3.2 calls it from `sendTurn`. Do NOT rewrite — extend
- **`ConversationsController`** (`apps/agent-be/src/conversations/conversations.controller.ts`) — Story 3.1 delivered this. Has `POST /` (create conversation) and `GET /:id/status`. Story 3.2 adds `GET /:id/skills` and `POST /:id/turns`. Do NOT rewrite — extend
- **`ISandboxService` interface** (`libs/shared-types/src/sandbox.interface.ts`) — Story 3.1 delivered this. Has `provision`, `clone`, `resume`, `destroy`, `injectGitConfig`, `getWorkingTreeStatus`, `terminateProcess`. Story 3.2 adds `listSkills`. The `SANDBOX_SERVICE` Symbol DI token is exported from the same file
- **`SandboxServiceFake`** (`apps/agent-be/test/helpers/sandbox-service.fake.ts`) — Story 3.1 delivered this. Has `failNextProvision()`, `setProvisionDelay()`, `getStatus()`, `executeCommand()`, `activeSandboxCount()`. Story 3.2 adds `setSkills()` and implements `listSkills()`. Do NOT modify existing methods
- **`buildTestModule()`** (`apps/agent-be/test/helpers/test-module-builder.ts`) — canonical NestJS test module factory. Pre-wires `SandboxServiceFake` via `SANDBOX_SERVICE` DI token. Do NOT modify
- **`SideNavigation`** (`apps/web/src/components/shell/SideNavigation.tsx`) — Story 1.8 delivered this. Has an empty conversation list div (`data-testid="conversation-list"`). Story 3.2 populates it. The component is a Client Component (uses `usePathname`). Do NOT rewrite — extend by adding a `conversations` prop
- **`AppShell`** (`apps/web/src/components/shell/AppShell.tsx`) — Story 1.8 delivered this. Client Component, renders `SideNavigation` (desktop + mobile drawer). Focus management moves focus to `h1` on route change. Do NOT rewrite — extend by adding a `conversations` prop and passing it through
- **`(app)/layout.tsx`** (`apps/web/src/app/(dashboard)/(app)/layout.tsx`) — Story 1.8 delivered this. Server Component, guards on `RepoConnection`, renders `AppShell`. Already fetches `repoConnection` via Prisma. Story 3.2 adds a conversation list query. Do NOT rewrite — extend
- **`/conversations/new/page.tsx`** — Story 3.1 delivered this. Server Component, mints boundary JWT, renders `ConversationPane`. Do NOT modify (the `ConversationPane` changes handle the new behavior)
- **Boundary JWT** (`apps/web/src/lib/boundary-jwt.ts`) — Story 3.1 delivered this. `mintBoundaryJwt(userId)` signs a JWT with `jose.SignJWT`. Reuse for all browser→agent-be REST calls. Do NOT modify
- **`SessionEventsService`** (`apps/agent-be/src/streaming/session-events.service.ts`) — Story 3.1 delivered this. Uses `ReplaySubject<SseEvent>(100)` per conversation. Do NOT modify
- **`StreamingController`** (`apps/agent-be/src/streaming/streaming.controller.ts`) — Story 3.1 delivered this. SSE endpoint at `GET /conversations/:id/events`. Do NOT modify
- **`IdleTimeoutService`** (`apps/agent-be/src/sandbox/idle-timeout.service.ts`) — Story 3.1 delivered this. `startTimer()`, `clearTimer()`, `clearAll()`, `OnModuleDestroy`. The `onFirstMessage` method in `ConversationsService` already calls `clearTimer` — Story 3.2 wires `sendTurn` to call `onFirstMessage`. Do NOT modify
- **`nestjs-zod` `createZodDto` + `ZodValidationPipe`** — Story 3.1 wired this at the `POST /conversations` boundary. Story 3.2 reuses the same pattern for `POST /conversations/:id/turns`. Do NOT modify the pipe — just create a new DTO
- **`@Public()` decorator** (`apps/agent-be/src/common/decorators/public.decorator.ts`) — Story 3.1 delivered this. Do NOT modify
- **Design tokens** (`tailwind.config.ts`) — `bg`, `surface`, `surface-raised`, `border`, `border-subtle`, `text-1/2/3`, `accent`, `positive`, `caution`, `negative`. Use semantic token names, never raw hex. Do NOT modify
- **`cn()` helper** (`apps/web/src/lib/utils.ts`) — clsx + tailwind-merge. Always use for conditional class merging. Do NOT modify
- **`auth()`** (`apps/web/src/lib/auth.ts`) — Auth.js v5. `session.userId` is the authenticated user's ID. Do NOT modify

### How AC-1 Is Satisfied

AC-1 ("Slash Command Picker opens on `/`") is satisfied by:

1. `ConversationPane` detects when the user types `/` at the start of an empty input (or when the input starts with `/` followed by non-whitespace)
2. The picker opens as a floating dropdown anchored above the chat input (absolute positioning, `bottom-full`)
3. Skills are fetched from agent-be via `GET /api/conversations/:id/skills` on `SESSION_READY` — the endpoint calls `sandboxService.listSkills(sandboxId)` which reads `.claude/skills/` from the sandbox filesystem
4. Further typing narrows the list by skill-name prefix (filtering done in `ConversationPane`, passed to `SlashCommandPicker`)
5. Arrow keys move `pickerSelectedIndex` (wrap around), Enter selects the focused skill (appends `/{name} ` to input), Escape dismisses
6. Selecting a skill appends the full slash command and focuses the input
7. Outside click dismisses the picker

### How AC-2 Is Satisfied

AC-2 ("No skills found") is satisfied by:

1. `sandboxService.listSkills()` returns `[]` when `.claude/skills/` is empty or doesn't exist
2. `SlashCommandPicker` renders "No skills found in this repository." when the skills array is empty
3. The picker still opens (so the user knows the feature exists) — it just shows the empty state

### How AC-3 Is Satisfied

AC-3 ("Skill selected and sent") is satisfied by:

1. Selecting a skill appends `/{skill.name} ` to the input
2. The user sends the message (Enter or Send button)
3. `ConversationPane.sendMessage()` calls `POST /api/conversations/:id/turns` with `{ content: message }`
4. `ConversationsService.sendTurn()` persists the turn (`role: 'user'`, `content: message`), clears the idle timeout, generates the semantic title
5. The agent invocation (streaming response, persona) is Story 3.3 scope (DP-2, DP-5)

### How AC-4 Is Satisfied

AC-4 ("URL transition and side nav") is satisfied by:

1. On first message send, `sendMessage()` receives `{ conversationId, title }` from the backend
2. If the current URL is `/conversations/new`, `router.push(`/conversations/${conversationId}`)` transitions to the permanent URL
3. The navigation triggers the `(app)/layout.tsx` Server Component to re-render, fetching the updated conversation list (including the new conversation with its title)
4. `SideNavigation` renders the conversation list — the new conversation appears with its 2–5 word semantic title
5. The `localStorage` draft (`new-conversation-draft`) is cleared on successful send

### Architecture Compliance

- **Global prefix `/api`** — all agent-be endpoints resolve to `/api/conversations/:id/skills` and `/api/conversations/:id/turns`
- **Raw resource body on success** — `GET /:id/skills` returns `SkillInfo[]` directly; `POST /:id/turns` returns `{ conversationId, title }` directly. No `{ data: ... }` wrapper
- **`{ code, message, meta }` error envelope** — `HttpExceptionFilter` maps all errors. `sendTurn` throws `NotFoundException` for unknown conversations (the filter maps it)
- **Zod + nestjs-zod** — `SendMessageDto` via `createZodDto` + `ZodValidationPipe` at the `POST /:id/turns` boundary. NEVER use `class-validator` / `class-transformer`
- **Boundary JWT** — `BoundaryJwtGuard` validates the JWT from the `Authorization` header. The browser sends it via `Authorization: Bearer {boundaryJwt}`
- **`ActiveUserGuard`** — fetches live `User` row, attaches `UserContext` to `request.user`. Controllers consume via `@User() user: UserContext`
- **`ISandboxService` test seam** — `SANDBOX_SERVICE` Symbol DI token. `listSkills` is on the interface (already declared in baseline), with the production throwing stub replaced by the real implementation and the fake already returning a controllable list
- **Tenant isolation** — `listSkills` and `sendTurn` both verify conversation ownership via `findFirst({ where: { id: conversationId, userId } })`. The `userId` filter IS the tenant authorization check
- **No server-to-server calls** — `apps/web` reads Postgres directly for the conversation list (side nav). The browser connects directly to agent-be for skills listing and message sending
- **No global client-state library** — `ConversationPane` uses local React state for picker state, skills, input. `SideNavigation` receives conversations as a prop (Server Component data)
- **Draft persistence** — `localStorage` keyed by `new-conversation-draft` (pre-send state on New Conversation page). Cleared on successful send. The codebase (`ConversationPane.tsx` lines 153-169) uses this key; note EXPERIENCE.md line 231 specifies the key as `new-conversation` — the code and this story use `new-conversation-draft` consistently (see Deferred Findings)
- **Server Components are default** — `/conversations/:id/page.tsx` is a Server Component (reads Postgres). `ConversationPane` and `SlashCommandPicker` are `'use client'`
- **`null as never` after `redirect()`** — the `/conversations/:id` page uses this pattern after `redirect('/sign-in')` and `redirect('/conversations/new')`
- **`searchParams` is a `Promise` in Next.js 16** — the `/conversations/:id` page types `params: Promise<{ conversationId: string }>` and awaits it
- **REST endpoints: plural nouns** — `/conversations/:id/turns`, `/conversations/:id/skills` (architecture line 328)
- **Co-located tests** — `*.spec.ts` / `*.test.tsx` next to source. Integration tests in `apps/agent-be/test/integration/`
- **Shell-quote interpolated values** — N/A for Story 3.2 (no new sandbox process commands with user-controlled values). The `ls -1 .claude/skills/` command has no interpolated values

### Library/Framework Requirements

**No new dependencies needed.** All required packages were installed in Story 3.1:

- **`nestjs-zod`** — already installed (Story 3.1). Use `createZodDto` for `SendMessageDto`
- **`zod` ^4.4.3** — already in dependencies. Use for `SendMessageDto` schema
- **`jose`** — already available (transitive dep of `next-auth`). Boundary JWT signing/verification already wired
- **`@daytonaio/sdk` 0.187.0** — already installed (Story 3.1). Used by `SandboxService.listSkills` via `sandbox.process.executeCommand`
- **Next.js App Router** — built into Next.js 16. `useRouter` from `next/navigation` for client-side navigation
- **shadcn/ui** — already configured. No new shadcn components needed for Story 3.2 (the slash command picker is a custom component, not a shadcn primitive)

### File Structure Requirements

New files in `apps/agent-be/`:
```
src/
├── conversations/
│   ├── dto/
│   │   └── send-message.dto.ts          # Zod schema for POST /:id/turns (Task 3.1 — create)
│   ├── semantic-title.ts                # generateSemanticTitle() pure function (Task 3.4 — create)
│   └── semantic-title.spec.ts           # unit tests for title generation (Task 3.5 — create)
```

New files in `apps/web/`:
```
src/
├── components/
│   └── conversation/
│       ├── SlashCommandPicker.tsx       # floating dropdown, presentational (Task 4.1 — REPLACE no-op stub)
│       └── SlashCommandPicker.test.tsx  # (Task 4.2 — REMOVE it.skip from existing RED-phase tests)
├── app/(dashboard)/(app)/conversations/
    └── [conversationId]/
        ├── page.tsx                     # Server Component, reads conversation from Postgres (Task 6.1 — create)
        ├── loading.tsx                  # skeleton with <h1> (Task 6.3 — create)
        └── error.tsx                    # Client Component error boundary (Task 6.4 — create)
```

Modified files:
- `libs/shared-types/src/sandbox.interface.ts` — **no change needed** (`SkillInfo` + `listSkills` already present in baseline)
- `apps/agent-be/src/sandbox/sandbox.service.ts` — **REPLACE** the `listSkills` throwing stub (lines 129-131) with the real `ls -1 .claude/skills/` implementation
- `apps/agent-be/test/helpers/sandbox-service.fake.ts` — **no change needed** (`listSkills`, `setSkills()`, `skills` field already present in baseline)
- `apps/agent-be/src/conversations/conversations.controller.ts` — add `GET /:id/skills` and `POST /:id/turns` endpoints
- `apps/agent-be/src/conversations/conversations.service.ts` — **REPLACE** the `listSkills` throwing stub (lines 168-170) and `sendTurn` throwing stub (lines 172-178) with real implementations; `sandboxIds` Map already exists (do not re-add)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — **REMOVE `it.skip`** from existing RED-phase tests (lines 238-349) and make them pass
- `apps/web/src/components/conversation/SlashCommandPicker.tsx` — **REPLACE** the no-op stub (returns `null`) with the real implementation
- `apps/web/src/components/conversation/SlashCommandPicker.test.tsx` — **REMOVE `it.skip`** from existing RED-phase tests and make them pass
- `apps/web/src/components/conversation/ConversationPane.tsx` — integrate slash command picker, wire message sending, URL transition, accept `initialConversationId` prop
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — **REMOVE `it.skip`** from existing RED-phase tests (lines 246-458) and make them pass
- `apps/web/src/app/(dashboard)/(app)/layout.tsx` — fetch last 5 conversations, pass to AppShell
- `apps/web/src/components/shell/AppShell.tsx` — accept `conversations` prop, pass to SideNavigation
- `apps/web/src/components/shell/SideNavigation.tsx` — render conversation list from prop

### Testing Requirements

- **Test organization:** co-located `*.spec.ts` / `*.test.tsx` next to source. Integration tests in `apps/agent-be/test/integration/`
- **Test priority tags:** `[P0]` for AC coverage (100% pass required), `[P1]` for edge cases (≥95% pass)
- **`buildTestModule()`** — always use for agent-be tests. Pre-wires `SandboxServiceFake` via `SANDBOX_SERVICE` DI token. Use `sandboxFake.setSkills([...])` to control the skills list
- **`SandboxServiceFake`** — use `setSkills()` to test AC-1 (skills listed) and AC-2 (empty state)
- **Mock `fetch`** — `jest.spyOn(global, 'fetch').mockImplementation(...)` for `ConversationPane` tests (REST calls to agent-be)
- **Mock `EventSource`** — existing mock pattern from Story 3.1 (`MockEventSource` class)
- **Mock `useRouter`** — `jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))` for URL transition tests
- **Server Component page tests** — call the async component function directly, `renderToStaticMarkup(element)`, assert on HTML. Mock `auth()`, `mintBoundaryJwt()`, `getPrisma()`
- **`semantic-title.spec.ts`** — pure function tests, no mocks needed. Use `@jest-environment node`
- **Keyboard event testing** — use `fireEvent.keyDown(input, { key: 'ArrowDown' })` to test picker navigation. Assert on `pickerSelectedIndex` via the highlighted item in the rendered output

### Previous Story Intelligence

- **Story 3.1 (done):** Delivered the agent-be foundational infrastructure (config, prisma, filters, guards, modules), `ConversationPane` (session-start state machine), `ConversationsService` (createConversation, provisionSandbox, onFirstMessage, getStatus), `StreamingController` (SSE endpoint), `SessionEventsService` (ReplaySubject per conversation), `IdleTimeoutService`, `ProvisionQueueService`, `SandboxService` (Daytona integration), `CredentialsService`, `EncryptionService`, boundary JWT. Key patterns: `buildTestModule()` for agent-be tests, `SandboxServiceFake` with control hooks, `jose` for JWT, `ReplaySubject` for SSE, fire-and-forget with `void ... .catch()`, `findFirst` for tenant-scoped lookups, `@Public()` decorator for `/health`, shell-quoting for sandbox commands, `HttpExceptionFilter` maps all errors to `{ code, message, meta }`. Story 3.2 extends `ConversationPane`, `ConversationsService`, `ConversationsController`, `ISandboxService`, `SandboxServiceFake`, `SideNavigation`, `AppShell`, and the `(app)/layout.tsx`. All 22 agent-be tests + 485 web tests pass. Lint: 0 errors. Typecheck: clean
- **Story 2.5 (done):** Established the `react-markdown` synchronous `Markdown` component pattern for Server Components. Not directly relevant to Story 3.2 (no Markdown rendering — that's Story 3.3), but the `@jest-environment node` for WebCrypto tests and ESM default-export mock patterns are relevant if any new ESM deps are added (none expected in Story 3.2)
- **Story 2.6 (done):** Established the clickable display component pattern (`<Link>` as root element, pre-constructed `href` prop). Relevant to the side nav conversation list — each conversation is a `<Link href="/conversations/{id}">`. `role="listitem"` on `<Link>` overrides implicit `link` role in tests — use `getByRole('listitem')` if needed. `cn()` for class merging, focus rings on all focusable elements
- **Story 1.8 (done):** Delivered `AppShell`, `SideNavigation`, `Breadcrumb`, and the `(dashboard)/(app)/` route structure. `AppShell`'s focus management moves focus to `h1` on route change — the `/conversations/:id` page must render an `<h1>`. The `SideNavigation` has an empty conversation list div — Story 3.2 populates it. The `(app)/layout.tsx` guards on `RepoConnection` — Story 3.2 adds a conversation list query to the same layout

### Git Intelligence

- Recent commits: `d357b97 docs(test-arch): add Epic 2 traceability matrix`, `a3d4896 fix(web): reclassify oauth decrypt failures as credential errors`, `ad8264c docs(pipeline): record stories 2.5 and 2.6 runs`, `1ec9f32 feat(epics): implement epic 2 artifact mirroring and project map browsing`. Epic 1 and Epic 2 are complete. Story 3.1 is done. Story 3.2 is the second story in Epic 3
- The agent-be has the foundational infrastructure from Story 3.1: config, prisma, filters, guards, conversations module, sandbox module, streaming module, credentials module. Story 3.2 extends the conversations and sandbox modules
- The web app has `ConversationPane` from Story 3.1. Story 3.2 extends it with the slash command picker and message sending

### Project Structure Notes

**Alignment with architecture directory structure:**

- `apps/agent-be/src/conversations/dto/send-message.dto.ts` — matches architecture's `conversations/dto/` directory (line 571-572)
- `apps/agent-be/src/conversations/semantic-title.ts` — new file, not explicitly in architecture's directory listing. Placed in `conversations/` because it's a conversation-domain concern (title generation). Consistent with the module's ownership
- `apps/web/src/components/conversation/SlashCommandPicker.tsx` — matches architecture's `components/conversation/` directory (line 500-506). The architecture lists `ConversationPane.tsx`, `ToolPill.tsx`, `SemanticPill.tsx`, `WorkingTreeIndicator.tsx`, `ManualCommitButton.tsx`, `useDraftPersistence.ts` — `SlashCommandPicker.tsx` is a new component not explicitly listed but implied by UX-DR8
- `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx` — matches architecture's `conversations/[conversationId]/page.tsx` (line 487-488)

**Variance from architecture:**
- `semantic-title.ts` is a new file not in the architecture's directory listing. It's a pure utility function for title generation. Placed in `conversations/` (not `common/`) because it's a conversation-domain concern, not a cross-cutting utility. Per the architecture's "no shared utility library beyond `libs/shared-types` and `libs/database-schemas`" rule, app-local utilities stay in their feature directory
- `SlashCommandPicker.tsx` is not explicitly in the architecture's `components/conversation/` listing, but it's implied by UX-DR8 ("Build the Slash Command Picker"). The architecture's listing is illustrative, not exhaustive (line 615: "Test files are co-located per the Naming/Structure Patterns above — omitted for brevity")

### Out of Scope (Do Not Implement)

- **Streaming agent response (token streaming, Markdown rendering, thinking indicator):** Story 3.3 scope. Story 3.2 persists the user's message but does not stream an agent response
- **Agent invocation (Claude Agent SDK, persona adoption, tool execution):** Story 3.3 scope. The backend has no concept of a "selected skill" — the message is persisted as text, and Story 3.3 wires the agent loop
- **Auto-growing textarea (52px–200px, Enter to send, Shift+Enter for newline):** Story 3.3 scope (FR-10, UX-DR3). Story 3.2 keeps the minimal text input from Story 3.1
- **Tool Pills and Semantic Pills:** Story 3.4 scope
- **Working tree indicator (dirty/clean UI):** Story 3.6 scope
- **Manual commit:** Story 3.6 scope
- **Conversation resume (Reconnecting… state):** Story 3.5 scope. Story 3.2 handles only new conversations and the first-message URL transition. The `/conversations/:id` page renders `ConversationPane` with an `initialConversationId`, but the resume/reconnect logic (restoring sandbox state, replaying turns) is Story 3.5
- **Cost tracking (per-user LLM spend):** Story 3.8 scope
- **Mid-session idle timeout:** Story 3.9 scope
- **Circuit breaker, heartbeat, back-pressure:** Story 3.3/3.4 scope
- **Credential failure propagation (CREDENTIAL_FAILURE event):** Story 3.7 scope
- **Access denied propagation (ACCESS_DENIED event):** Story 3.7 scope
- **SSE drain on deploy:** Story 3.12 scope
- **Concurrent conversations (10 max):** Story 3.11 scope
- **Conversation list page at `/conversations`:** Not in any Epic 3 story's ACs. The side nav shows the last 5 conversations — that's the MVP conversation list
- **Blocked entry states (conversation limit, seat limit):** Story 3.11 (conversation limit) and post-MVP billing (seat limit). EXPERIENCE.md specifies them but they are not in Story 3.2's ACs
- **Scroll-to-bottom button:** Story 3.3 scope (FR-10, UX-DR9)
- **Copy-to-clipboard on messages:** Story 3.3 scope (FR-10, UX-DR4)
- **Message timestamps:** Story 3.3 scope (FR-10, UX-DR4)
- **Draft persistence for existing conversations (keyed by conversationId):** Story 3.3 scope (FR-10). Story 3.2 keeps the `new-conversation-draft` localStorage key (pre-send state on New Conversation page only) — matches the existing `ConversationPane.tsx` implementation

### Deferred Findings (Validation — DP-5)

The following gaps were identified during story validation but are out of Story 3.2's acceptance criteria. Recorded per DP-5 (defer scope temptation) for the relevant artifact owners to address:

- **Architecture doc does not codify the skill-discovery mechanism:** `architecture.md` contains zero occurrences of "skill", "slash command", or "picker". The `listSkills` method on `ISandboxService`, the `GET /:id/skills` endpoint, and the `SlashCommandPicker` component are implemented per UX-DR8 and technical research but have no architecture-doc delta. The architecture's Pattern Enforcement rule (line 392: "Any future change to these patterns is a deliberate architecture-doc update") suggests the `ISandboxService` contract extension and new REST endpoint should be reflected in an architecture update. **Owner: architect.**
- **`/conversations/page.tsx` (conversation list page, FR-11) is in the architecture directory tree (line 486) but no Epic 3 story implements it.** The side nav shows the last 5 conversations — that's the MVP conversation list. A dedicated list page is not in any story's ACs. **Owner: PM/planning.**
- **Seat-limit blocked-entry state (FR-9 line 248) is not owned by any Epic 3 story.** FR-19 makes it unreachable in MVP (all users have full access), so this is an accepted gap — but the FR Coverage Map claims FR-9 → Epic 3 while one FR-9 consequence (seat-limit upgrade prompt) is unowned. **Owner: PM/planning.**
- **Browser-tab `<title>` not set from conversation title:** PRD FR-11 line 275 says "The semantic title is used as the Conversation's page title" — Story 3.2 Task 6.1 renders it as an `<h1>` (visible heading) but does not export a Next.js `metadata` object to set the browser tab `<title>`. Trivial to add but not in the ACs. **Owner: Story 3.3 (chat experience) or a follow-up.**
- **`localStorage` draft key discrepancy:** codebase uses `new-conversation-draft`; EXPERIENCE.md line 231 specifies `new-conversation`. The story keeps the codebase key (DP-3 — simplest reversible). The UX spec should be reconciled to match the implementation, or the implementation renamed in a coordinated change. **Owner: UX writer / Story 3.3.**
- **ATDD checklist test-count inconsistency:** `atdd-checklist-3-2-invoke-bmad-skills-via-slash-command.md` priority counts do not reconcile (summary says 26 P0 + 5 P1 = 31; per-AC table totals 30 P0 + 4 P1 = 34). Does not affect the story file but affects test-arch sign-off. **Owner: test architect.**
- **AC-3 "Agent invokes that Skill… taking on its defined persona" (epics.md line 643) is deferred to Story 3.3 (DP-2), but Story 3.3's ACs do not explicitly re-state persona adoption.** Traceability gap: the UJ-2/FR-9 persona requirement is not clearly owned by any single story's AC. **Owner: PM/planning.**

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 3.2 (lines 623-647), Epic 3 description (lines 580-583), FR9 (line 36), FR11 (line 40), UX-DR2 (line 137), UX-DR8 (line 149), FR Coverage Map FR9 (line 185)
- PRD: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` — FR-9 Conversation Initiation (lines 235-249), Skill definition (line 98), semantic title (line 275), side nav (line 475), blocked entry states (line 149)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — ISandboxService contract (lines 394-436), REST endpoints plural nouns (line 328), conversations controller pattern (line 441), directory structure (lines 485-488, 567-577), API patterns (lines 262-268), frontend architecture (lines 270-278), data flow (line 669), component boundaries (lines 627-630)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — Slash Command Picker visual spec (lines 152-160 front-matter, lines 359-361 prose), side nav active/inactive styling (lines 307-319 prose, line 66-69 front-matter)
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — Slash Command Picker behavior (lines 116-125), chat input keyboard behavior (lines 326-334), side navigation (lines 59-75), New Conversation surface (lines 220-231), URL patterns (lines 52-53)
- Project context: `_bmad-output/project-context.md` — NestJS patterns (lines 115-133), Next.js patterns (lines 85-113), Prisma patterns (lines 134-143), testing rules (lines 163-200), security rules (lines 283-303), `findFirst` for tenant-scoped lookup (line 143), `null as never` after redirect (line 99), `useRouter` for navigation (line 111), `searchParams` Promise in Next.js 16 (line 109)
- Decision policy: `_bmad-output/decision-policy.md` — DP-2 (spec contradiction: semantic intent over literal text), DP-3 (simplest reversible option), DP-4 (test-only changes), DP-5 (defer scope temptation)
- Previous story: `_bmad-output/implementation-artifacts/3-1-provision-a-sandbox-when-opening-a-conversation.md` — Story 3.1 delivered the foundational infrastructure. Key learnings: `jose` ESM requires `transformIgnorePatterns`, `@jest-environment node` for WebCrypto tests, `buildTestModule()` pre-wires `SandboxServiceFake`, `ReplaySubject` for SSE, `findFirst` for tenant-scoped lookups, `@Public()` for `/health`, shell-quoting for sandbox commands, `HttpExceptionFilter` maps all errors
- Implementation: `libs/shared-types/src/sandbox.interface.ts` (ISandboxService contract to extend), `apps/agent-be/src/sandbox/sandbox.service.ts` (production service to extend), `apps/agent-be/test/helpers/sandbox-service.fake.ts` (test double to extend), `apps/agent-be/src/conversations/conversations.controller.ts` (controller to extend), `apps/agent-be/src/conversations/conversations.service.ts` (service to extend), `apps/web/src/components/conversation/ConversationPane.tsx` (component to extend), `apps/web/src/components/shell/SideNavigation.tsx` (component to extend), `apps/web/src/components/shell/AppShell.tsx` (component to extend), `apps/web/src/app/(dashboard)/(app)/layout.tsx` (layout to extend), `apps/web/src/lib/boundary-jwt.ts` (reuse for REST calls), `apps/web/src/lib/auth.ts` (session.userId), `libs/database-schemas/src/prisma/schema.prisma` (Conversation and Turn models — no changes needed)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- Initial test run revealed `fireEvent.change` does not reliably trigger React 19's `onChange` for text inputs across test boundaries in `ConversationPane.test.tsx`. Tests 4-6 in the Slash Command Picker describe block failed because `handleInputChange` was never called. Root cause: `fireEvent.change` fires a `change` DOM event, but React 19's `onChange` for text inputs listens to the `input` event. The first 3 tests passed due to fresh React event system state, but subsequent tests failed. Fix: switched failing tests to `userEvent.type()` which properly simulates user input via `input` events. This is a test-only change (DP-4).
- Layout test (`layout.test.tsx`) needed `conversation.findMany` mock added after the layout was extended to fetch the side nav conversation list.

### Completion Notes List

- **Task 1:** Verified pre-seeded scaffolding (`SkillInfo`, `listSkills` on `ISandboxService`, `SandboxServiceFake` hooks). Replaced `SandboxService.listSkills` throwing stub with real `ls -1 .claude/skills/` implementation — try/catch returns `[]` on any failure (AC-2 empty state).
- **Task 2:** Added `GET /:id/skills` endpoint to `ConversationsController`. Replaced `ConversationsService.listSkills` stub with real implementation — tenant-scoped `findFirst`, returns `[]` if conversation not found or sandbox not yet provisioned. Unskipped 4 RED-phase tests (all pass).
- **Task 3:** Created `SendMessageDto` (Zod schema via `nestjs-zod`). Added `POST /:id/turns` endpoint. Replaced `ConversationsService.sendTurn` stub with real implementation — tenant-scoped ownership check (`NotFoundException` if not found), idle timeout cleared via `onFirstMessage`, user turn persisted, semantic title generated on first message only. Created `semantic-title.ts` pure function (strips leading `/`, takes first 5 words, truncates to 60 chars with ellipsis, "New Conversation" fallback for empty content). Created `semantic-title.spec.ts` with 6 tests. Unskipped 6 RED-phase service tests (all pass).
- **Task 4:** Replaced `SlashCommandPicker` no-op stub with real presentational component — floating dropdown with `role="listbox"`/`role="option"`, `bg-surface-raised` highlight for selected index, empty state message. Unskipped 4 RED-phase tests (all pass).
- **Task 5:** Extended `ConversationPane` with slash command picker integration — picker state (`pickerOpen`, `pickerQuery`, `pickerSelectedIndex`), skills fetched on `SESSION_READY` via `GET /:id/skills`, keyboard navigation (ArrowDown/ArrowUp wrap, Enter selects, Escape dismisses), outside-click dismissal, message sending via `POST /:id/turns`, URL transition via `router.push()` on first message, `initialConversationId` prop for existing conversations. Unskipped 8 RED-phase tests (all pass after switching to `userEvent.type` for React 19 compatibility).
- **Task 6:** Created `/conversations/:id` page (Server Component — reads conversation from Postgres, mints boundary JWT, renders `ConversationPane` with `initialConversationId`). Created `loading.tsx` skeleton and `error.tsx` error boundary following `project-map` patterns.
- **Task 7:** Extended `(app)/layout.tsx` to fetch last 5 conversations by `lastActiveAt` desc (filtered by `title: { not: null }`). Extended `AppShell` and `SideNavigation` to accept and render `conversations` prop — each conversation is a `<Link>` with active state highlighting. Unskipped 3 RED-phase SideNavigation tests. Updated AppShell and layout tests for the new prop.
- **Task 8:** All verification passed — lint (0 errors both projects), typecheck (clean both projects), agent-be tests (36 passed), web tests (501 passed).

### File List

**New files:**
- `apps/agent-be/src/conversations/dto/send-message.dto.ts`
- `apps/agent-be/src/conversations/semantic-title.ts`
- `apps/agent-be/src/conversations/semantic-title.spec.ts`
- `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx`
- `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/loading.tsx`
- `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/error.tsx`

**Modified files:**
- `apps/agent-be/src/sandbox/sandbox.service.ts` — replaced `listSkills` stub with real implementation
- `apps/agent-be/src/conversations/conversations.controller.ts` — added `GET /:id/skills` and `POST /:id/turns` endpoints
- `apps/agent-be/src/conversations/conversations.service.ts` — replaced `listSkills` and `sendTurn` stubs with real implementations
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — unskipped 10 RED-phase tests
- `apps/web/src/components/conversation/SlashCommandPicker.tsx` — replaced no-op stub with real component
- `apps/web/src/components/conversation/SlashCommandPicker.test.tsx` — unskipped 4 RED-phase tests
- `apps/web/src/components/conversation/ConversationPane.tsx` — integrated picker, message sending, URL transition, `initialConversationId` prop
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — unskipped 8 RED-phase tests, updated fetch mock, switched to `userEvent.type` for React 19 compatibility
- `apps/web/src/app/(dashboard)/(app)/layout.tsx` — added conversation list query
- `apps/web/src/app/(dashboard)/(app)/layout.test.tsx` — added `conversation.findMany` mock
- `apps/web/src/components/shell/AppShell.tsx` — added `conversations` prop
- `apps/web/src/components/shell/AppShell.test.tsx` — updated to pass `conversations` prop
- `apps/web/src/components/shell/SideNavigation.tsx` — added `conversations` prop, renders conversation list
- `apps/web/src/components/shell/SideNavigation.test.tsx` — unskipped 3 RED-phase tests

## Change Log

- 2026-07-04: Story 3.2 implementation complete — all 8 tasks done, all ACs satisfied, 501 web tests + 36 agent-be tests pass, lint and typecheck clean.
- 2026-07-04: Code review complete — 5 patch findings fixed, 4 dismissed, deferred findings recorded in deferred-work.md.
- 2026-07-04: Test quality review (skipped-test sweep) — scanned all Story 3.2 test files (`semantic-title.spec.ts`, `conversations.service.spec.ts`, `SlashCommandPicker.test.tsx`, `ConversationPane.test.tsx`, `SideNavigation.test.tsx`) plus full agent-be and web suites for `it.skip` / `test.skip` / `describe.skip` / `xit` / `xdescribe` / `xtest` / `it.todo` / `test.fixme`. **0 skipped tests found.** agent-be: 37 passed, 0 skipped. web: 513 passed, 0 skipped. All RED-phase `it.skip` scaffolds were unskipped during implementation (Tasks 2.3, 3.5, 3.6, 4.2, 5.3, 7.4). No patches required.
- 2026-07-04: NFR evidence audit — 4 NFR-specific patches applied (select projection on `sendTurn` findFirst, select projection on `/conversations/:id` page findFirst, max content length on `SendMessageDto`, warn-level logging on `listSkills` failure). 7 deferred findings documented. All 37 agent-be + 513 web tests pass, lint and typecheck clean.

### Review Findings

_Reviewed against baseline `d357b97`. Three parallel layers: Blind Hunter (adversarial), Edge Case Hunter (boundary analysis), Acceptance Auditor (spec compliance)._

**Decision records (applied during review):**

- **Decision (DP-2):** `lastActiveAt` update was nested inside the `if (conversation.title === null)` block per Task 3.3's literal text, but AC-4 requires the side nav to order by `lastActiveAt` desc — which only works if every turn refreshes it. Followed semantic intent (AC-4) over literal task text; moved `lastActiveAt` update to always run, title update stays conditional. Amended the implementation accordingly.
- **Decision (DP-3):** `SlashCommandPicker` declared `query` and `onDismiss` props that were never destructured or used — the parent owns filtering and dismissal per Task 4.1's "presentational component" intent. Simplest reversible option: removed the dead props from the interface and stopped passing them from the parent.
- **Decision (DP-3):** `conversationId` React state was declared but the value was never read (`const [, setConversationId]`) — the ref `conversationIdRef` is the actual tracker. Simplest reversible option: removed the dead state and its setter calls, keeping the ref.
- **Decision (DP-5):** Semantic title 2-word minimum (AC-3 says "2–5 word") — deferred. The heuristic is an explicit placeholder per story DP-3 ("An LLM-generated title can replace it in Story 3.3"). Enforcing a minimum on 1-word input either loses information (fallback) or requires padding. Deferred to Story 3.3.
- **Decision (DP-5):** `SendMessageDto` has no `max()` on `content` — deferred. The story Task 3.1 explicitly specifies `z.string().min(1)` only. Adding a max is reasonable hardening but beyond the ACs.
- **Decision (DP-5):** `sendTurn` does not validate sandbox state before persisting — deferred. Sandbox state validation for agent execution is Story 3.3 scope (DP-2 scope note in story).

**Patch findings (all fixed):**

- [x] [Review][Patch] `lastActiveAt` not updated on subsequent turns [`apps/agent-be/src/conversations/conversations.service.ts:206`] — `conversation.update` with `lastActiveAt` was inside the `if (title === null)` block; subsequent turns never refreshed it, making the side nav stale. Fixed: always update `lastActiveAt`, only include `title` when generating it.
- [x] [Review][Patch] Surrogate pair truncation in semantic title [`apps/agent-be/src/conversations/semantic-title.ts:12`] — `slice(0, 59)` splits by UTF-16 code units; an emoji at the boundary produces a lone surrogate. Fixed: use `Array.from()` to split by code points before slicing.
- [x] [Review][Patch] Non-array JSON response crashes skills filter [`apps/web/src/components/conversation/ConversationPane.tsx:169`] — `setSkills(data)` without `Array.isArray` guard; a non-array response crashes `skills.filter` in `filteredSkills`. Fixed: guard with `Array.isArray(data)`.
- [x] [Review][Patch] SlashCommandPicker dead props `query` and `onDismiss` [`apps/web/src/components/conversation/SlashCommandPicker.tsx:6`] — declared in interface, passed by parent, never destructured or used. Fixed: removed from interface and parent prop passes.
- [x] [Review][Patch] `conversationId` React state declared but never read [`apps/web/src/components/conversation/ConversationPane.tsx:23`] — `const [, setConversationId]` discards the value; the ref is the actual tracker; setter triggers unnecessary re-renders. Fixed: removed the dead state and setter calls.

**Deferred findings (pre-existing or out of scope — see deferred-work.md for details):**

- [x] [Review][Defer] Story 3.1 code issues in sandbox.service.ts and conversations.service.ts (OAuth token in clone URL, provisionQueue.release imbalance, SSH URL throws, resume wrong conversationId, isNotFoundError fragile, getWorkingTreeStatus rename parsing, provision cleanup delete signature, EventSource.onerror, boundary JWT in URL query string, createConversation body discard, idle-timeout callback race, process restarts in-memory Maps, retry with initialConversationId, empty API_URL, getStatus auth conflation, test title contradicts behavior, queue-cap test) — pre-existing, not caused by Story 3.2 changes.
- [x] [Review][Defer] `sendTurn` does not validate sandbox state before persisting — Story 3.3 scope (agent invocation).
- [x] [Review][Defer] `SendMessageDto` has no `max()` on content — DP-5, not in ACs.
- [x] [Review][Defer] Semantic title 2-word minimum — DP-5, placeholder heuristic replaced by LLM in Story 3.3.

**Dismissed findings (4):**

- listSkills swallows all failures → spec-mandated (Task 1.2: "any command failure returns `[]`").
- listSkills no SKILL.md validation → out of scope (`SkillInfo` is `{ name }`, story defines skills as directories).
- Slash command persisted but never invoked → DP-2, explicitly Story 3.3 scope (scope note in story).
- ConversationPage redirects to `/conversations/new` for not-found → spec-mandated (Task 6.1).

### NFR Review Findings

_NFR evidence audit (bmad-testarch-nfr). Patches are NFR-specific only — performance, security, reliability, scalability. No features implemented, no unrelated code refactored, no database migrations, no test quality fixes._

**NFR patches applied (all fixed):**

- [x] [NFR][Patch] `sendTurn` findFirst fetches all columns unnecessarily [`apps/agent-be/src/conversations/conversations.service.ts:192`] — `findFirst({ where: { id, userId } })` returned the full Conversation row (id, userId, title, lastActiveAt, createdAt, updatedAt) when only `title` is read. Performance patch: added `select: { id: true, title: true }` projection — reduces column transfer from Postgres on every turn send.
- [x] [NFR][Patch] `/conversations/:id` page findFirst fetches all columns unnecessarily [`apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx:22`] — `findFirst({ where: { id, userId } })` returned the full row when only `title` is rendered. Performance patch: added `select: { id: true, title: true }` projection. Test assertions updated to match.
- [x] [NFR][Patch] `SendMessageDto` has no max content length [`apps/agent-be/src/conversations/dto/send-message.dto.ts:5`] — `z.string().min(1)` accepted unbounded input, enabling DoS via oversized payloads and unbounded DB writes. Security/Scalability patch: added `.max(10_000)` (10KB cap — generous for chat messages). Resolves the DP-5 deferred finding from code review.
- [x] [NFR][Patch] `listSkills` silently swallows all failures [`apps/agent-be/src/sandbox/sandbox.service.ts:147`] — catch block returned `[]` with no log entry, making sandbox filesystem read failures invisible to operators. Reliability/Observability patch: added `this.logger.warn(...)` in the catch block. Behavior unchanged (still returns `[]` per AC-2), but failures are now diagnosable. The spec-mandated empty-state behavior is preserved.

**NFR deferred findings:**

- [x] [NFR][Defer] `sendTurn` multi-write not transaction-wrapped [`apps/agent-be/src/conversations/conversations.service.ts:202-218`] — `turn.create` + `conversation.update` are dependent writes not wrapped in `$transaction`. If `conversation.update` fails after `turn.create` succeeds, the turn is persisted but the title/lastActiveAt is stale (side nav ordering drift, title never set on first message). Reliability concern. Deferred: wrapping in `$transaction` requires mock Prisma updates in `conversations.service.spec.ts` (the mock lacks `$transaction` and the assertions check `turn.create`/`conversation.update` directly). Non-trivial test impact — belongs in a dev step, not an NFR patch.
- [x] [NFR][Defer] `onFirstMessage` called before turn persistence [`apps/agent-be/src/conversations/conversations.service.ts:200`] — idle timeout is cleared before `turn.create`. If `turn.create` fails, the sandbox stays alive with no idle timer (orphaned sandbox until process restart). Minor reliability concern — `OnModuleDestroy` cleans up on shutdown. Deferred: reordering requires careful interaction analysis with the Story 3.3 agent loop.
- [x] [NFR][Defer] No `AbortSignal.timeout()` on `fetchSkills` and `sendMessage` fetch calls [`apps/web/src/components/conversation/ConversationPane.tsx:161,182`] — browser→agent-be REST calls have no timeout; a stuck agent-be hangs the UI indefinitely. Reliability concern. Deferred: adding `AbortSignal.timeout()` requires careful test interaction analysis (fake timers in `ConversationPane.test.tsx`). The `startSession` fetch (Story 3.1) has the same gap — coordinated fix in Story 3.3.
- [x] [NFR][Defer] No NFR-P2 timing test for `/conversations/:id` page (Performance) — NFR-P2 (chat ready ≤10s) includes sandbox provisioning, not just page render. Story 3.2 doesn't change the provisioning flow. A timing test requires a real Daytona sandbox — deferred to Story 3.3 (full chat experience with agent invocation).
- [x] [NFR][Defer] No security headers in `next.config.js` (Security) — project-wide, pre-existing from Stories 2.1–2.5. Not Story 3.2-specific. Recommended in prior NFR assessments.
- [x] [NFR][Defer] No `npm audit`/Snyk in CI (Security) — project-wide, pre-existing. Not Story 3.2-specific.
- [x] [NFR][Defer] No structured logging / monitoring in agent-be conversations module (Reliability) — project-wide, pre-existing. `listSkills` now logs at `warn` level (NFR patch above), but no structured JSON logging or APM exists.
