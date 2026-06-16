---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md'
---

# bmad-easy - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for bmad-easy, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Repository Connection via URL — User connects a GitHub Repository by URL; platform uses the OAuth access token (authorized with `repo` scope at sign-in) to validate write access and complete setup. No token entry field. Token stored encrypted at rest, never returned to client.

FR2: BMAD Initialization Validation — Platform validates the connected Repository contains `_bmad/`, `_bmad-output/`, `.claude/`, and that BMAD is v6.x, before activating the connection. Blocking messages with documentation links on failure (missing directories, unsupported version, no Skills found).

FR3: Commit Attribution per User — Commits produced through Conversations are attributed to the individual user's GitHub OAuth identity (name/email, injected into Sandbox git config at session init), not a shared platform credential.

FR4: Credential Health Monitoring — Platform monitors stored Repository credentials; any git operation returning 401/403 updates credential health to `failed` within one operation cycle; Project Map shows a re-auth notification with a re-authorize flow.

FR5: Repository State on Page Load — Platform reads current `_bmad-output/` state on page load and manual refresh; no real-time push detection in MVP.

FR6: Project Map Artifact List — Authenticated user with a connected Repository sees a list of Artifacts from `_bmad-output/` organized by type and status (completed/in-progress), with empty-state prompt.

FR7: Manual Refresh — User can manually refresh the Project Map to reflect recently committed Artifacts without interrupting active Conversations; refresh indicator shown during the read.

FR8: Navigation from Project Map — Clicking a completed Artifact opens the Artifact Browser; clicking an in-progress Artifact with an open Conversation page brings that page into focus, otherwise opens read-only in the Artifact Browser.

FR9: Conversation Initiation — User opens a new Conversation from the Project Map or side nav; Skills derived from `.claude/skills/` are presented as slash-command suggestions; Sandbox is provisioned and Repository cloned as a background operation on page open; chat ready within 10 seconds (NFR-P2); blocked with upgrade prompt if Seat allocation exceeded.

FR10: Streaming Chat Interface — Agent responses stream token-by-token with Markdown rendering; thinking indicator and distinct tool-execution indicator; first token within 1,500ms (NFR-P1); auto-growing textarea; Enter to send, Shift+Enter for newline; Stop button while processing; per-message and per-code-block copy actions; scroll-to-bottom button; timestamps; persisted unsent draft restored on refresh.

FR11: Concurrent Conversations — User can have up to 10 concurrent active Conversations, each with independent Sandbox/chat history and a stable URL; each Conversation gets a 2–5 word semantic title; "session limit reached" message beyond the cap.

FR12: Tool Call Visibility and Semantic Recognition — Every agent tool call produces an inline Tool Pill at the point of occurrence; `git commit` is promoted to a "Progress saved" Semantic Pill (with artifact type/title and a View link) only after confirmed commit success; failed tool calls produce an error-state Tool Pill with no automatic retry; all other tool calls remain standard Tool Pills for MVP.

FR13: Conversation Persistence — A Conversation is always resumable; navigating to it restores full chat history; underlying Sandbox re-initialization is handled transparently with a loading indicator.

FR14: Working Tree State Indicator — A persistent status indicator in the chat input area shows `● Unsaved changes` (amber) when the working tree is dirty, or `✓ All saved`/hidden when clean; updates after each agent action or manual save.

FR15: Manual Commit — User can commit the current working tree state on demand via a Save control; confirmation labeled "Save" (no git vocabulary); executes a platform-level commit inside the Sandbox bypassing the Agent; does not run mid-agent-turn (fires when next idle); message format `chore(platform-save): checkpoint [<ISO8601 UTC timestamp>]` (not shown in chat UI); success shows a Semantic Pill and resets indicator; failure shows an error-state Tool Pill and indicator remains dirty; disabled while save in progress; no-op without error if working tree is already clean.

FR16: Artifact Rendering — User can view any committed Artifact from `_bmad-output/` as rendered Markdown; single page with two layout states (full-width list vs. list + selected artifact); content read at latest committed revision; read-only; loads within 2 seconds (NFR-P4).

FR17: Artifact Access Points — Artifact Browser is accessible from the Project Map and from Semantic Pills in Conversation chat; both resolve to the same rendered view; "Back" navigation returns to the entry point.

FR18: Platform Authentication — User authenticates via GitHub OAuth, the only sign-up/sign-in path; session persists across refreshes until logout or expiry (minimum 8 hours preferred).

FR19: Access Control — All platform access requires authentication; unauthenticated requests redirect to sign-in; in MVP all authenticated users have unrestricted access to all features (no paywall/trial/billing enforcement); concurrent session limits (FR11) enforced regardless of access status.

### NonFunctional Requirements

**Security**

NFR-S1: Sandbox credential and network isolation — Platform-internal credentials must never be injected into a Sandbox; only the user's OAuth access token is permitted inside for git transport; the Sandbox network must have no accessible routes to the agent backend's internal service endpoints.

NFR-S2: Credential isolation — Repository OAuth access tokens must never be resolved across users; every git credential lookup must pass a tenant authorization check at the service layer before resolution.

NFR-S3: Active sandbox termination on deactivation — When a user account is deactivated, all active Sandboxes for that user must be terminated immediately through the platform's sandbox management interface; passive rejection of new requests is insufficient. (Deferred to post-MVP per architecture — no in-app deactivation flow exists in MVP scope to trigger it.)

NFR-S4: OAuth token storage — GitHub OAuth access tokens are encrypted (AES-256-GCM) when stored and never returned to the client after initial submission.

**Performance**

NFR-P1: First streamed token appears within 1,500ms of the user sending a message.

NFR-P2: Chat is ready for user input within 10 seconds of opening a Conversation page (applies to repositories under ~200MB).

NFR-P3: Project Map loads within 2 seconds of page open.

NFR-P4: Artifact Browser loads a committed Artifact within 2 seconds.

NFR-P5: Manual commit completes within 5 seconds of the save operation executing (exclusive of queue time waiting for an agent turn to complete).

**Reliability**

NFR-R1: Credential health status must update within one git operation cycle of a 401/403 response; silent credential failures are not acceptable.

NFR-R2: Committed Artifacts are always recoverable from the Repository, independent of Sandbox state; uncommitted working tree state is not guaranteed to survive a Sandbox restart.

NFR-R3: The streaming transport must not silently drop events when the client is slow to consume; it must apply back-pressure and pause token emission until the client is ready.

NFR-R4: The streaming transport must support 10 concurrent agent SSE connections per browser session without connection starvation, matching the FR11 Conversation limit; a transport configuration imposing a lower browser-level connection limit is not acceptable.

**Observability**

NFR-O1: Platform must track per-user LLM spend via the Agent SDK's cost reporting from day one; budget alerting for anomalous per-user spending must be operational at launch.

### Additional Requirements

- Starter/greenfield template: Nx workspace with pnpm (`npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=pnpm`), generating `apps/web` (Next.js 15, App Router, Tailwind, Turbopack), `apps/agent-be` (NestJS), `libs/shared-types`, `libs/database-schemas`. This is the first implementation story (Epic 1, Story 1).
- Single shared Prisma schema/client library (`libs/database-schemas`) consumed independently by `apps/web` and `apps/agent-be` against one Railway Postgres instance — eliminates schema drift structurally.
- Boundary JWT between `apps/web` and `apps/agent-be`, decoupled from Auth.js's internal session JWE; transported via `Authorization` header (REST) and query parameter (SSE, since `EventSource` cannot set headers); long-lived, re-minted per page load; logs sanitized to strip the token.
- OAuth token at rest: per-user DEK + platform KEK envelope encryption (AES-256-GCM); KEK stored as a Railway env var for MVP with a documented rotation runbook and enforced GCM nonce-uniqueness.
- `apps/agent-be` is the sole initiating party toward Daytona/sandbox-agent; Daytona API key held only by `apps/agent-be`, stored as a plain Railway env secret (no rotation for MVP); every session/log-streaming call must be scoped to the correct `sandboxId`/Conversation.
- `apps/web` never calls `apps/agent-be` server-to-server: browser connects directly to `apps/agent-be` for the live REST+SSE interaction; `apps/web` reads Conversation history, Project Map, and Artifact Browser data directly from Postgres via the shared Prisma client.
- Live `user.active` DB check (`active-user.guard.ts`) on every privileged `apps/agent-be` request, attaching user context via a `@User()` decorator — single point of enforcement, no controller re-implements it.
- Consistent JSON error envelope across `apps/agent-be`: `{ code, message, meta }`; raw resource bodies on success (no wrapper).
- `@nestjs/throttler` for rate limiting on `apps/agent-be` (simple global/per-route limits, no per-tenant tiering for MVP).
- No global client-state library in `apps/web`; Server Components/Server Actions read Postgres directly; local React state for ephemeral UI only.
- Draft message persistence via browser `localStorage`, keyed by `conversationId` (or `new-conversation` for the pre-send state), no server round-trip.
- No automatic/scoped client-side revalidation anywhere — manual browser reload is the refresh mechanism for Conversation pane, Project Map, and Artifact Browser; this also covers SSE-reconnect-mid-session recovery (falls back to the cold-load path).
- shadcn/ui (Radix + Tailwind) as the frontend component library.
- CI via GitHub Actions: lint + all available test suites (unit/integration/e2e) gate the pipeline; deploy is a manual trigger, not automatic on merge.
- Infrastructure: `apps/web` on Vercel; `apps/agent-be` (Docker) and Postgres on Railway; production only for MVP, no separate staging.
- Deployment invariant: `apps/agent-be` must be fronted by an HTTP/2-capable reverse proxy (required for NFR-R4's 10 concurrent SSE connections; HTTP/1.1 caps browsers at 6).
- NestJS shutdown hooks must drain SSE connections on deploy (notify clients, allow reconnect) rather than hard-killing them, given the single-container constraint.
- Sandbox idle timeout: a Sandbox provisioned on page open that receives no first message within a configurable timeout (default 60s) must be torn down.
- Sandbox initialization sequence (ordered, every provision and every resume): provision → clone (or restore on resume) → inject per-user git config → run `git status --porcelain` → emit `WORKING_TREE_*` event → emit `SESSION_READY`.
- `sandbox-agent` (JSONL→AG-UI bridge): pin to an exact binary version in the Dockerfile; before any upgrade, diff the event-mapping changelog and validate against a recorded BMAD session replay. This is a PR-review checklist item enforced by process, not a story acceptance criterion or automated test.
- AG-UI packages (`@assistant-ui/react-ag-ui`, `@ag-ui/client`, `@ag-ui/core`): pin to exact versions; same changelog-review + session-replay-validation discipline before any upgrade, enforced the same way (PR-review checklist, not an AC).
- Circuit-breaker: if `sandbox-agent` fails to emit events within a timeout, or crashes, the backend must terminate the Claude Code agent process via the Daytona process management API before emitting an error event to the user (prevents a runaway, unobserved agent from continuing to act/commit).
- SSE channel must emit heartbeat comments on a fixed interval so the browser can detect dead connections even when `sandbox-agent` is stalled.
- Frontend session-start timeout (distinct from the server-side idle timeout) for the case where `SESSION_READY` never arrives, with a retry affordance — prevents the "Starting session…" state from spinning indefinitely.
- Credential failure must propagate immediately to the active session: `tool-pill-classifier.service.ts` detects 401/403 patterns in git-related tool call results and emits a `CREDENTIAL_FAILURE` event on the existing SSE channel (not just on next page load).
- Project Map and Artifact Browser must remain functional during a Daytona outage (pure Postgres/git reads with no sandbox dependency); only new Conversation provisioning should be blocked.
- Conversation/turn state must be written to Postgres on every turn, not held only in NestJS memory, so a container restart does not lose history.
- Per-user sandbox provision concurrency cap (2–3 simultaneous provisions) to avoid bursting GitHub's OAuth rate limit when a user opens multiple Conversation tabs quickly.
- Sandbox provision failure cleanup: on a failed `SandboxService.provision()` call, any partial Daytona allocation must be torn down to avoid zombie sandboxes accruing billing.
- `artifacts.service.ts` is the sole boundary that mirrors Repository Artifact state into Postgres, scanning `_bmad-output/` and upserting metadata + content at commit-time, for `apps/web` to read.
- During Repository connection validation (FR1), the platform must test write access with a dry-run git operation and surface the GitHub org OAuth App restriction cause explicitly in the 403 error path (not a generic "couldn't connect" message).
- Conversation schema should include a `last_active_at` field from the start, to enable future archival (archival mechanism itself is out of scope for MVP).
- UX/PRD reconciliation: EXPERIENCE.md's onboarding Flow 1 describes a Repository URL + Access Token (PAT) two-field flow; per the PRD's DL-7 decision and the architecture document's correction, the correct MVP onboarding model is OAuth-only — a single Repository URL input, no token entry field, using the `repo`-scoped OAuth token already obtained at sign-in. Onboarding stories must implement the URL-only model, not the EXPERIENCE.md PAT flow.
- Repository size boundary: NFR-P2 (10s chat-ready target) is asserted, not empirically validated, for repositories ≤ ~200MB; this boundary should be documented and is a candidate for an explicit size check/warning at Repository connection time.

### UX Design Requirements

UX-DR1: Implement the dark-mode-only design token system (colors, typography scale, spacing unit, radii) from DESIGN.md as the Tailwind theme configuration — single source of truth; no light mode in MVP.

UX-DR2: Build the persistent Side Navigation component (240px fixed): product wordmark, "New Conversation" button, last-5 Conversation list with semantic titles (truncated, ellipsis), separator, Project Map + Artifact Browser links, bottom-pinned avatar-circle Settings entry; active vs. inactive item styling per DESIGN.md.

UX-DR3: Build the Chat Input component: auto-growing textarea (52px–200px, internal scroll above max), working tree indicator (left), Send/Stop button (right); Enter submits, Shift+Enter inserts newline; draft persisted to `localStorage` keyed by `conversationId` (or `new-conversation`), cleared on successful send.

UX-DR4: Build streaming Message components (User, Agent) with Markdown rendered progressively during streaming (not transformed on completion), blinking cursor at the insertion point, per-message hover copy action, always-visible per-code-block copy button, and the specified timestamp display rules (relative "just now" under 1 minute, hover-only on user messages, low-prominence inline on agent messages).

UX-DR5: Build the Tool Pill component: inline chip at the exact stream position of the tool call; click toggles an inline expanded view of input/output in monospace; click again collapses; expansion does not affect surrounding layout.

UX-DR6: Build the Semantic Pill component: elevated, positive-colored variant replacing a recognized Tool Pill (MVP: `git commit` only) — "Progress saved" label, artifact type/title, underlined "View" link opening the Artifact Browser to the committed artifact; multiple commits in one Conversation each produce a distinct Semantic Pill.

UX-DR7: Build the Working Tree Indicator component: dirty state (amber, `● Unsaved changes`, clickable to open a "Save current progress?" popover with Save/Cancel), clean state (muted `✓ All saved`, non-interactive), hidden state (no session yet); "Saving after response…" sub-state when a save is queued behind an in-progress agent turn; `aria-live="polite"` on state changes.

UX-DR8: Build the Slash Command Picker: floating dropdown anchored above the chat input on typing `/`; filters by skill-name prefix; keyboard-navigable (arrows move focus, Enter selects, Escape dismisses); empty state "No skills found in this repository."; dismiss on outside click or Escape.

UX-DR9: Build the Scroll-to-Bottom button: bottom-center anchored, visible only when scrolled above the latest message, shows a new-message count badge (e.g. "3 new messages") when applicable; auto-scroll pauses on manual scroll-up during streaming and resumes when the button is clicked.

UX-DR10: Build the Credential Error Banner: non-dismissible, top of Project Map and Artifact Browser content areas, plain-language copy with a link that opens the re-auth flow as an inline modal (not a page navigation).

UX-DR11: Build the Artifact Card (Project Map) and Artifact List entry (Artifact Browser) components: type label, title, in-progress/completed status badge (per DESIGN.md's distinct badge styles, not color alone), last-modified timestamp.

UX-DR12: Implement the Artifact Browser's two-state layout: full-width flat list (no selection, sorted by last-modified descending) vs. 280px list + content pane (artifact selected, accent left-border + highlighted background on the selected entry); selection state must apply immediately when arriving via a Project Map click or a Semantic Pill "View" link.

UX-DR13: Implement the three-zone independent scroll model for the app shell: fixed side navigation, fixed chat input (or fixed artifact list/page header), independently-scrolling chat message panel / artifact content pane.

UX-DR14: Implement the Onboarding surface per the architecture's DL-7 correction: single Repository URL input (no Access Token field), URL-format validation on blur, "Validating…" read-only state, BMAD-not-found blocking message with documentation link, validation-failure inline error, success redirect to Project Map. (Supersedes EXPERIENCE.md Flow 1's two-field PAT description.)

UX-DR15: Implement the Sign-In surface: GitHub OAuth as the sole interactive element, no separate sign-up screen, inline auth-error state with OAuth button re-enabled.

UX-DR16: Implement the accessibility floor: visible 2px accent focus rings with 2px offset on all interactive elements (never suppressed on click); route-change focus moves to the page's `h1` or first interactive element; full keyboard navigability; focus-trapping modals (re-auth, save confirmation) that return focus to the trigger on close; non-color state signaling everywhere (icon + text label + color, never color alone); `aria-live="polite"` on the chat message stream and the working tree indicator; `role="status"` on loading/save-confirmation status messages; `prefers-reduced-motion` handling for the streaming cursor and the thinking indicator; `aria-label`s on avatar circles and icon-only buttons.

UX-DR17: Implement responsive behavior: desktop-first with a 1024px minimum supported viewport; tablet (768–1023px) collapses the side navigation into an off-canvas drawer triggered by a hamburger button; mobile is explicitly out of scope for MVP.

UX-DR18: Implement the Agent Processing state machine (Idle / Thinking / Tool executing / Streaming response) governing chat input enabled/disabled, Stop button visibility, and the active indicator (three-dot animation vs. inline tool-execution label vs. streaming cursor) — the thinking and tool-execution indicators must remain visually distinct.

UX-DR19: Implement the per-surface loading/empty/error state patterns: Project Map (loading skeleton, empty-state prompt, populated, credential-failed banner, refreshing spinner), Conversation (cold-load skeleton, history-load error with Refresh, "Reconnecting…" with full history visible and disabled input, active/idle), Artifact Browser (list-only, list+detail, loading skeleton, load-error with Refresh, credential-failed banner), Settings (static "coming soon", no states needed).

UX-DR20: Implement the breadcrumb navigation pattern ("← Project Map") on depth-1 pages (Conversation, Artifact Browser); no animated page/route transitions in MVP (any future addition must respect `prefers-reduced-motion`).

### FR Coverage Map

FR1: Epic 1 - Repository Connection via URL
FR2: Epic 1 - BMAD Initialization Validation
FR3: Epic 1 - Commit Attribution per User (Story 1.5 derives the identity; end-to-end verification that an actual commit carries that identity, as teammates would see it in git history, is completed in Epic 3 - Story 3.10, once commits occur)
FR4: Epic 1 - Credential Health Monitoring (real-time SSE propagation wired in Epic 3 once the streaming channel exists)
FR5: Epic 2 - Repository State on Page Load (shares the `artifacts.service.ts` mechanism with FR6/16; kept out of Epic 1 to avoid a forward dependency on Project Map)
FR6: Epic 2 - Project Map Artifact List
FR7: Epic 2 - Manual Refresh
FR8: Epic 2 - Navigation from Project Map (the "focus an already-open Conversation tab" case is completed in Epic 3 once Conversation pages exist; Epic 2 delivers Artifact Browser navigation only, avoiding a forward dependency)
FR9: Epic 3 - Conversation Initiation
FR10: Epic 3 - Streaming Chat Interface
FR11: Epic 3 - Concurrent Conversations
FR12: Epic 3 - Tool Call Visibility and Semantic Recognition
FR13: Epic 3 - Conversation Persistence
FR14: Epic 3 - Working Tree State Indicator
FR15: Epic 3 - Manual Commit
FR16: Epic 2 - Artifact Rendering
FR17: Epic 2 - Artifact Access Points
FR18: Epic 1 - Platform Authentication
FR19: Epic 1 - Access Control

NFR-S1: Epic 3 - Sandbox credential/network isolation
NFR-S2: Epic 1 - Credential isolation (tenant-scoped OAuth token lookups); respected by Epic 3 when injecting sandbox git config
NFR-S3: Deferred to post-MVP - no in-app deactivation flow exists in MVP scope to trigger active sandbox termination
NFR-S4: Epic 1 - OAuth token storage encryption
NFR-P1: Epic 3 - First streamed token latency
NFR-P2: Epic 3 - Chat ready within 10s of Conversation page open
NFR-P3: Epic 2 - Project Map load time
NFR-P4: Epic 2 - Artifact Browser load time
NFR-P5: Epic 3 - Manual commit latency
NFR-R1: Epic 1 - Credential health update cycle; Epic 3 - real-time SSE propagation to the active session
NFR-R2: Epic 3 - Session recovery from git as source of truth
NFR-R3: Epic 3 - SSE back-pressure
NFR-R4: Epic 3 - SSE concurrent connection capacity
NFR-O1: Epic 3 - Per-user LLM spend monitoring

Additional Requirements: Epic 1 - Nx/pnpm scaffold, Postgres/Prisma schema, boundary JWT, OAuth envelope encryption (including GCM nonce-uniqueness enforcement, Story 1.3), KEK rotation runbook (Story 1.9), CI/CD, deployment infra, GitHub org OAuth-restriction dry-run check; Epic 2 - artifacts.service.ts Postgres mirror of `_bmad-output/`; Epic 3 - sandbox lifecycle (provisioning, pre-first-message idle timeout, mid-session idle timeout (Story 3.9), init sequence, circuit breaker, heartbeat, provision queue, failure cleanup), sandbox-agent/AG-UI version pinning (enforced via PR-review checklist, not a story AC), credential-failure SSE propagation, Conversation history persistence-on-every-turn, `last_active_at` schema field, commit author identity verification (Story 3.10). UX/PRD reconciliation (URL-only onboarding, no PAT field) applies to Epic 1.

UX Design Requirements: Epic 1 - UX-DR1 (design tokens), UX-DR2 (side navigation), UX-DR13 (three-zone scroll shell), UX-DR14, UX-DR15, UX-DR16 (accessibility floor), UX-DR17 (responsive behavior), UX-DR20 (breadcrumb nav) — all delivered once, as the persistent app shell (Story 1.8), and inherited by every later epic's pages; Epic 2 - UX-DR10, UX-DR11, UX-DR12, UX-DR19 (Project Map/Artifact Browser states); Epic 3 - UX-DR3 through UX-DR9, UX-DR18, UX-DR19 (Conversation states).

## Epic List

### Epic 1: Authentication & Repository Connection
A new user can sign in with GitHub, connect their team's BMAD-enabled repository, and have it validated and ready for use — including the foundational platform scaffold (Nx workspace, Postgres/Prisma, boundary JWT, OAuth envelope encryption, CI/CD) that every later epic builds on.
**FRs covered:** FR1, FR2, FR3, FR4, FR18, FR19

### Epic 2: Project Map & Artifact Browser
A user can see what BMAD work the team has produced and what is in progress (Project Map), and read any committed Artifact as clean, rendered Markdown (Artifact Browser) — without opening GitHub.
**FRs covered:** FR5, FR6, FR7, FR8, FR16, FR17

### Epic 3: Conversations — Running BMAD Skills with the Agent
A user can open a Conversation, invoke BMAD Skills via slash command, converse with the streaming Agent across multiple turns, see Tool Pills and Semantic Pills for agent actions, track the working tree state, and manually save progress — with the Agent's committed output flowing into the Artifact Browser and Project Map built in Epic 2.
**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14, FR15

## Epic 1: Authentication & Repository Connection

A new user can sign in with GitHub, connect their team's BMAD-enabled repository, and have it validated and ready for use — including the foundational platform scaffold (Nx workspace, Postgres/Prisma, boundary JWT, OAuth envelope encryption, CI/CD) that every later epic builds on.

### Story 1.1: Scaffold the Platform Monorepo and CI Pipeline

As a developer on the bmad-easy team,
I want the Nx monorepo scaffolded with the web and agent-be apps, shared libs, design tokens, and a CI pipeline,
So that every subsequent feature has a consistent, deployable foundation to build on.

**Acceptance Criteria:**

**Given** an empty repository
**When** the Nx workspace is initialized per the architecture's Initialization Commands
**Then** `apps/web` (Next.js 15, App Router, Tailwind, TypeScript strict), `apps/agent-be` (NestJS), `libs/shared-types`, and `libs/database-schemas` exist and build successfully via `nx build`
**And** `libs/database-schemas` contains the initial Prisma schema (User model at minimum) and generates a client consumed by both apps against a single Railway Postgres instance

**Given** the scaffolded `apps/web`
**When** the Tailwind theme is configured
**Then** the DESIGN.md color/typography/spacing/radius tokens are applied as the Tailwind theme (UX-DR1), with no light-mode variant

**Given** the scaffolded monorepo
**When** a commit is pushed
**Then** GitHub Actions CI runs lint and all available test suites as a merge gate
**And** deploy is a manual trigger (not automatic) for both Vercel (`apps/web`) and Railway (`apps/agent-be`)

### Story 1.2: Sign In with GitHub

As a non-dev team member,
I want to sign in to bmad-easy using my GitHub account,
So that I can access the platform without creating a separate username/password.

**Acceptance Criteria:**

**Given** an unauthenticated user visits the platform
**When** they are redirected to `/sign-in`
**Then** they see a centered single-column layout with "Sign in with GitHub" as the sole interactive element
**And** clicking it initiates the GitHub OAuth flow requesting `repo` scope

**Given** a successful GitHub OAuth authorization
**When** the session is established
**Then** the session persists across browser refreshes until logout or expiry (minimum 8 hours)

**Given** an OAuth failure
**When** the user returns to the sign-in screen
**Then** an inline error ("Sign-in failed. Try again or contact support.") appears below the re-enabled button

**Given** any unauthenticated request to a platform page
**When** it reaches the server
**Then** it redirects to `/sign-in` (FR19)

### Story 1.3: Connect a Repository by URL

As a newly signed-in user,
I want to connect my team's GitHub repository by pasting its URL,
So that the platform can read and write BMAD artifacts there without me providing a separate token.

**Acceptance Criteria:**

**Given** an authenticated user with no connected repository
**When** they land on `/onboarding`
**Then** they see a single "Repository URL" input — no access-token field is shown (per architecture's DL-7 correction; supersedes EXPERIENCE.md's PAT-field description)

**Given** a submitted Repository URL
**When** the platform validates it
**Then** it checks that the OAuth access token obtained at sign-in grants write access to that repository

**Given** a successful validation
**When** the connection is established
**Then** the OAuth access token is stored AES-256-GCM encrypted (per-user DEK + platform KEK envelope encryption, NFR-S4) and is never returned to the client after initial submission
**And** each encryption operation generates a fresh, unique GCM nonce — verified by asserting no two stored ciphertexts for the same DEK ever share a nonce
**And** the user is redirected toward the Project Map (final landing route wired in Epic 2)

**Given** a failed validation
**When** the error is due to insufficient permission, an inaccessible repository, or a GitHub org OAuth App restriction (detected via a dry-run write check)
**Then** a descriptive inline error names the specific cause, including the org-restriction case explicitly rather than a generic "couldn't connect" message

### Story 1.4: Validate BMAD Initialization in the Connected Repository

As a user connecting a repository,
I want the platform to confirm BMAD is properly set up before I can start working,
So that I don't hit confusing failures later in a Conversation.

**Acceptance Criteria:**

**Given** a repository that has passed the write-access check in Story 1.3
**When** the platform inspects it
**Then** it confirms `_bmad/`, `_bmad-output/`, and `.claude/` are present and the BMAD version is 6.x
**And** an empty `_bmad-output/` is accepted, not treated as an error

**Given** any of `_bmad/`, `_bmad-output/`, `.claude/` is missing
**When** validation runs
**Then** a blocking message names the missing prerequisite and links to BMAD documentation

**Given** `.claude/skills/` is absent or contains no Skill files
**When** validation runs
**Then** a blocking message states that no Skills were found

**Given** the detected BMAD version is outside the v6.x range
**When** validation runs
**Then** a blocking message states only BMAD v6 is supported and names the detected version

### Story 1.5: Resolve Git Identity for Commit Attribution

As the platform,
I want to derive a git author identity from each user's GitHub OAuth profile,
So that commits made on their behalf in a Conversation are attributed to them individually, not a shared platform identity.

**Acceptance Criteria:**

**Given** a user has an authenticated GitHub OAuth profile
**When** the platform resolves their git identity
**Then** it produces the user's name and primary email exactly as returned by the OAuth profile claim

**Given** the OAuth profile returns no primary email
**When** the platform resolves git identity
**Then** it falls back to `{github_username}@users.noreply.github.com`

**Given** the resolved git identity
**When** it is exposed to other services
**Then** it is consumable by sandbox initialization (actual git-config injection is wired in Epic 3)
**And** the OAuth access token itself never appears in this identity record — it is used for HTTPS transport only and never appears in a commit record

### Story 1.6: Detect and Recover from Credential Failures

As a user whose repository connection has stopped working,
I want the platform to notice and let me re-authorize without disconnecting my repository,
So that I can keep working without redoing the entire connection setup.

**Acceptance Criteria:**

**Given** a git operation against a connected repository returns HTTP 401 or 403
**When** the platform processes that response
**Then** the credential health status is updated to `failed` within one operation cycle, with no silent failure (NFR-R1)

**Given** any credential lookup
**When** a token is about to be resolved
**Then** it first passes a tenant authorization check at the service layer — tokens are never resolved across users (NFR-S2)

**Given** a credential health status of `failed`
**When** the user initiates re-authorization
**Then** a re-auth flow lets them re-grant GitHub OAuth without disconnecting the repository
**And** on success, credential health returns to `healthy`

**Given** this story's scope
**When** considering UI display
**Then** displaying the failed status visually on the Project Map is delivered in Epic 2 — this story delivers detection, status, and the re-auth flow only

### Story 1.7: Enforce Authenticated, Full Access for All MVP Users

As the platform operator,
I want every page to require authentication and every authenticated MVP user to have full feature access,
So that the platform has a consistent access baseline before billing enforcement exists.

**Acceptance Criteria:**

**Given** any platform route
**When** an unauthenticated request reaches it
**Then** the request is redirected to `/sign-in`

**Given** an authenticated user
**When** they access any platform feature
**Then** access is granted without a paywall, trial expiry, or billing check (all MVP users auto-enrolled in full access)
**And** this access baseline is the only gate later epics' feature-specific limits (such as the FR11 concurrent-Conversation cap delivered in Epic 3) build on top of — it does not itself enforce any feature-level limit

### Story 1.8: Build the Persistent App Shell

As a user navigating the platform,
I want a consistent, accessible shell around every page,
So that navigation, scrolling, and keyboard use feel predictable everywhere, on any supported screen size.

**Acceptance Criteria:**

**Given** any authenticated page
**When** it renders
**Then** the Side Navigation (240px fixed) shows the product wordmark, a "New Conversation" button, the last 5 Conversations by semantic title (truncated with ellipsis), a separator, then Project Map and Artifact Browser links, with a bottom-pinned avatar-circle Settings entry, and active vs. inactive items styled per DESIGN.md (UX-DR2)
**And** no "show more"/"view all" affordance is shown beyond the 5 listed Conversations
**And** keyboard tab order reaches the side navigation before the main content area

**Given** a page with a chat panel or artifact content pane
**When** it renders
**Then** the side navigation and the chat input (or list/page header) remain fixed while only the message panel or content pane scrolls independently (three-zone scroll model, UX-DR13)

**Given** a depth-1 page (Conversation or Artifact Browser)
**When** it renders
**Then** a "← Project Map" breadcrumb is shown, and no animated page/route transitions are used (UX-DR20)

**Given** the accessibility floor (UX-DR16)
**When** any interactive element is focused, a route changes, a modal opens, or a status updates
**Then** a visible 2px accent focus ring with 2px offset appears and is never suppressed on click; route changes move focus to the page's `h1` or first interactive element; modals (re-auth, save confirmation) trap focus and return it to the trigger on close; state is never signaled by color alone; the chat message stream and working tree indicator use `aria-live="polite"`; loading/save-confirmation messages use `role="status"`; the streaming cursor and thinking indicator respect `prefers-reduced-motion`; avatar circles and icon-only buttons have `aria-label`s

**Given** the viewport width
**When** it is at least 1024px
**Then** the full desktop layout renders; between 768–1023px the side navigation collapses into an off-canvas drawer triggered by a hamburger button; below 768px is explicitly out of scope for MVP (UX-DR17)
**And** the drawer renders as an overlay (not a content reflow), dismisses on outside click and on Escape, and follows the same focus-trap/return-focus behavior as other modals in this story's accessibility floor

### Story 1.9: Document and Validate the KEK Rotation Runbook

As the platform operator,
I want a documented, validated procedure for rotating the platform's KEK,
So that a future key rotation can be performed correctly under pressure, without improvising against production credentials.

**Acceptance Criteria:**

**Given** the KEK stored as a Railway env var (per architecture)
**When** the rotation runbook is authored
**Then** it documents the exact steps to introduce a new KEK, re-wrap existing per-user DEKs under it, and retire the old KEK, without any plaintext OAuth token ever being exposed during the process

**Given** the authored runbook
**When** it is validated
**Then** the rotation procedure is executed at least once against a non-production environment, and every previously-encrypted token remains decryptable after rotation completes

**Given** the runbook is complete and validated
**When** it is delivered
**Then** it is committed to the repository (e.g. `docs/runbooks/kek-rotation.md`) rather than living only as institutional knowledge

## Epic 2: Project Map & Artifact Browser

A user can see what BMAD work the team has produced and what is in progress (Project Map), and read any committed Artifact as clean, rendered Markdown (Artifact Browser) — without opening GitHub.

### Story 2.1: Mirror Repository Artifacts into Postgres

As the platform,
I want to scan `_bmad-output/` and mirror Artifact metadata and content into Postgres,
So that the Project Map and Artifact Browser can read Artifact state quickly without a live git call on every page view.

**Acceptance Criteria:**

**Given** a connected repository validated in Epic 1
**When** the platform reads its current state on page load or manual refresh
**Then** `artifacts.service.ts` scans `_bmad-output/` and upserts artifact type, title (from frontmatter or path), status (completed/in-progress), last-modified timestamp, and content into Postgres (FR5)

**Given** an Agent commits a new or updated Artifact during a Conversation (wired in Epic 3)
**When** the commit is detected
**Then** the same mirroring mechanism upserts the latest state at commit-time

**Given** no real-time push detection exists in MVP
**When** the Repository changes outside of a page load or manual refresh
**Then** the mirrored state does not update until the next page load or manual refresh (FR5)

### Story 2.2: View the Project Map

As an authenticated user with a connected repository,
I want to see a list of Artifacts from `_bmad-output/` organized by type and status,
So that I can see what BMAD work the team has produced and what is in progress without opening GitHub.

**Acceptance Criteria:**

**Given** an authenticated user with a connected repository
**When** they land on the Project Map (`/`)
**Then** Artifacts are listed with type, title, and status (completed / in-progress), rendered as Artifact Cards per DESIGN.md (UX-DR11)

**Given** an in-progress Artifact has an active Conversation open as a page on this platform
**When** it is displayed
**Then** it is visually distinguished from completed Artifacts (distinct badge style, not color alone)

**Given** no `_bmad-output/` content exists
**When** the Project Map loads
**Then** an empty state shows a prompt to start the first Conversation (UX-DR19)

**Given** a credential health status of `failed` (Story 1.6)
**When** the Project Map renders
**Then** a non-dismissible Credential Error Banner appears above the artifact list with a link to the inline re-auth flow (UX-DR10)

**Given** the Project Map is loading
**When** data is being fetched
**Then** skeleton cards are shown, and the page loads within 2 seconds (NFR-P3)

### Story 2.3: Manually Refresh the Project Map

As a user who just committed work elsewhere,
I want to manually refresh the Project Map,
So that I can see recently committed Artifacts without leaving the page.

**Acceptance Criteria:**

**Given** the Project Map is visible
**When** the user activates the manual refresh control
**Then** `_bmad-output/` is re-read via the Story 2.1 mirroring mechanism (FR7)
**And** a refresh indicator (spinner replacing the refresh icon) is visible during the read

**Given** a refresh is in progress
**When** the user has an active Conversation open elsewhere
**Then** the refresh does not interrupt that Conversation

### Story 2.4: Browse and Read All Committed Artifacts

As a user who wants an overview of everything the team has produced,
I want to browse a flat list of all committed Artifacts,
So that I can find and read any of them as clean Markdown.

**Acceptance Criteria:**

**Given** an authenticated user navigates to the Artifact Browser directly (e.g. from the side nav)
**When** no Artifact is selected
**Then** a full-width flat list of all Artifacts from `_bmad-output/` is shown, sorted by last-modified date descending (FR16, UX-DR12)

**Given** the Artifact Browser is loading
**When** data is being fetched
**Then** a skeleton loader is shown in the content pane

**Given** a credential health status of `failed`
**When** the Artifact Browser renders
**Then** the same Credential Error Banner as the Project Map appears above the list, and artifact reads may fail until credentials are refreshed

### Story 2.5: View a Single Artifact's Rendered Content

As a user who has selected an Artifact,
I want to read its full content as rendered Markdown,
So that I can understand the team's work without GitHub's file navigation.

**Acceptance Criteria:**

**Given** an Artifact is selected by clicking it in the Artifact Browser's list (Story 2.4)
**When** the page renders
**Then** the list narrows to 280px and the rendered Artifact occupies the remaining content area (FR16, UX-DR12)
**And** content is read at its latest committed revision and rendered with standard Markdown formatting (headings, lists, tables, code blocks, bold, italic)
**And** the view is read-only — no editing controls are present
**And** the Artifact loads within 2 seconds (NFR-P4)

**Given** an Artifact fails to load
**When** the content pane renders
**Then** it shows "Couldn't load this artifact. Try refreshing the page." with a Refresh button

**Given** the Artifact Browser is entered directly (e.g. from the side nav)
**When** the user navigates back
**Then** "Back" returns them to the Artifact Browser's full list; arriving from the Project Map (Story 2.6) or a Conversation Semantic Pill (wired in Epic 3) instead returns the user to that entry point (FR17)

### Story 2.6: Navigate from the Project Map to an Artifact

As a user viewing the Project Map,
I want clicking an Artifact to take me to its content,
So that I can move seamlessly between the overview and the underlying work.

**Acceptance Criteria:**

**Given** a completed Artifact on the Project Map
**When** the user clicks it
**Then** it opens in the Artifact Browser (Story 2.5) with that Artifact pre-selected (FR8)

**Given** an in-progress Artifact on the Project Map
**When** the user clicks it
**Then** it opens the Artifact in the read-only Artifact Browser (FR8)
**And** bringing an already-open Conversation tab into focus instead, when one exists for that Artifact, is delivered in Epic 3 once Conversation pages exist (Story 3.5) — this story's click behavior is the same for every in-progress Artifact

## Epic 3: Conversations — Running BMAD Skills with the Agent

A user can open a Conversation, invoke BMAD Skills via slash command, converse with the streaming Agent across multiple turns, see Tool Pills and Semantic Pills for agent actions, track the working tree state, and manually save progress — with the Agent's committed output flowing into the Artifact Browser and Project Map built in Epic 2.

### Story 3.1: Provision a Sandbox When Opening a Conversation

As a user starting a new Conversation,
I want my session's Sandbox to begin provisioning the moment I open the page,
So that the chat is ready almost immediately instead of waiting on a cold start.

**Acceptance Criteria:**

**Given** a user opens a new Conversation page
**When** the page loads
**Then** a Sandbox is provisioned and the Repository is cloned inside it as a background operation, while the chat interface is visible immediately (FR9)
**And** the sandbox initialization sequence runs in order: provision → clone (or restore on resume) → inject the Story 1.5 git identity into git config → run `git status --porcelain` → emit a working-tree event → emit session-ready
**And** while provisioning, a spinner and "Starting session…" label are shown in the chat area with the input disabled
**And** the chat is ready for input within 10 seconds of page open for repositories under ~200MB (NFR-P2)

**Given** the user sends a first message before the Sandbox is ready
**When** they submit
**Then** the input is disabled momentarily, "Starting session…" is shown, and the message sends automatically once ready

**Given** a Sandbox is provisioned but receives no first message within 60 seconds
**When** the timeout elapses
**Then** the Sandbox is torn down to avoid a wasted allocation

**Given** a `SandboxService.provision()` call fails
**When** the failure occurs
**Then** any partial Daytona allocation is torn down to avoid a zombie sandbox accruing billing

**Given** `SESSION_READY` never arrives (e.g. a Daytona provisioning error)
**When** a client-side timeout (distinct from the server-side idle timeout) elapses
**Then** the user sees a retry affordance rather than an indefinitely spinning "Starting session…" state

**Given** a user opens multiple Conversation tabs in quick succession
**When** simultaneous provisioning is requested
**Then** a per-user concurrency cap of 2 simultaneous provisions prevents bursting GitHub's OAuth rate limit; a 3rd simultaneous request queues until a slot frees

### Story 3.2: Invoke BMAD Skills via Slash Command

As a user in a Conversation,
I want to browse and invoke the repository's available Skills with `/`,
So that I can run the same BMAD workflows my developer teammates run, without memorizing exact command names.

**Acceptance Criteria:**

**Given** an open Conversation
**When** the user types `/` in the chat input
**Then** a filterable, keyboard-navigable Slash Command Picker opens, listing Skills derived from `.claude/skills/` (FR9, UX-DR8)
**And** further typing narrows the list by skill-name prefix
**And** Arrow keys move focus, Enter selects the focused skill, Escape dismisses the picker

**Given** no Skills exist in the repository
**When** the picker opens
**Then** it displays "No skills found in this repository."

**Given** a Skill is selected
**When** the user sends the message
**Then** the Agent invokes that Skill within the current Conversation, taking on its defined persona

**Given** a New Conversation page with no permanent URL
**When** the first message is sent
**Then** the page transitions to `/conversations/:id`, the Conversation appears in the side nav with a 2–5 word semantic title, and the New Conversation page no longer exists for this session

### Story 3.3: Converse with the Streaming Agent

As a user running a Skill,
I want to converse with the Agent across multiple turns and see its responses stream in,
So that the interaction feels immediate and I can follow its reasoning as it works.

**Acceptance Criteria:**

**Given** the user sends a message
**When** the Agent responds
**Then** tokens stream progressively with Markdown rendered as they arrive (not transformed on completion), and the first token appears within 1,500ms (NFR-P1, FR10, UX-DR4)
**And** the SSE transport applies back-pressure rather than dropping events when the client is slow to consume (NFR-R3)
**And** a thinking indicator (three-dot animation) appears between tool calls before tokens are emitted; a visually distinct tool-execution indicator appears while a tool or Bash command runs (UX-DR18)

**Given** the chat input
**When** the user types
**Then** it is a multi-line auto-growing textarea (52px–200px) with Enter to send and Shift+Enter for a newline, and a Send button as a secondary affordance (FR10, UX-DR3)

**Given** the Agent is processing or executing a tool
**When** the user wants to interrupt
**Then** a Stop button is visible; activating it terminates the in-flight response and any running tool/Bash process without terminating the Sandbox, after which the user can send a new message

**Given** a message has been sent or received
**When** the user hovers over it
**Then** a copy-to-clipboard action is available; code blocks show an always-visible independent copy button; each message displays a timestamp per the relative/hover/inline rules in DESIGN.md (UX-DR4)

**Given** the user scrolls above the latest message during streaming
**When** new content arrives
**Then** auto-scroll pauses and a scroll-to-bottom button appears with a new-message count, re-enabling auto-scroll when clicked (UX-DR9)

**Given** an unsent draft message
**When** the user refreshes the Conversation page
**Then** the draft is restored from `localStorage` keyed by `conversationId`, and cleared on successful send

### Story 3.4: See Tool Calls and Recognized Actions Inline

As a user watching the Agent work,
I want to see every tool call it makes, with recognized actions like commits called out clearly,
So that I understand what the Agent is doing without needing to read raw tool output by default.

**Acceptance Criteria:**

**Given** the Agent makes any tool call
**When** it occurs
**Then** an inline "Running… [tool name]" label appears in the chat stream at that exact position while the tool executes (UX-DR18)
**And** once the tool call completes, that label is replaced in place — at the same stream position, with no layout shift to surrounding content — by the completed Tool Pill showing the tool name and a short status (FR12, UX-DR5)
**And** clicking the Tool Pill expands it inline to show raw input/output in monospace; clicking again collapses it, without affecting surrounding layout

**Given** the Agent performs a `git commit`
**When** the commit is confirmed successful (not on initiation)
**Then** its Tool Pill is promoted to a Semantic Pill: "Progress saved" with the Artifact type, title, and a "View" link that opens the Artifact Browser to that Artifact (FR12, UX-DR6)
**And** multiple commits in one Conversation each produce a distinct Semantic Pill at their respective positions

**Given** a `git commit` fails
**When** the failure occurs
**Then** an error-state Tool Pill is shown (not a Semantic Pill), the FR14 working-tree indicator remains dirty, and no automatic retry is attempted

**Given** any agent tool call fails
**When** the failure occurs
**Then** an error-state Tool Pill appears at that position in the stream, displaying the agent's error description

**Given** `sandbox-agent` (the JSONL→AG-UI bridge) crashes or stalls
**When** the backend detects this
**Then** it terminates the Claude Code agent process via the Daytona process management API before emitting an error event, preventing an unobserved agent from continuing to act or commit
**And** the SSE channel emits heartbeat comments on a fixed interval so a stalled connection is detectable even if no events are flowing

### Story 3.5: Resume and Run Concurrent Conversations

As a user juggling multiple BMAD workflows,
I want to have several Conversations active at once and pick up any of them later,
So that I'm not blocked working through one Skill at a time or losing context when I navigate away.

**Acceptance Criteria:**

**Given** a user has fewer than 10 active Conversations
**When** they open a new one
**Then** it runs with an independent Sandbox and chat history at its own stable URL (FR11)
**And** the SSE transport supports 10 concurrent connections per browser session without connection starvation, requiring an HTTP/2-capable reverse proxy in front of `apps/agent-be` (NFR-R4)

**Given** a user already has 10 active Conversations
**When** they attempt to open another
**Then** they see a "session limit reached" message rather than a silent failure (FR11)

**Given** a user navigates to an existing Conversation
**When** the page loads
**Then** its full chat history is restored immediately from Postgres, independent of Sandbox state (FR13, NFR-R2)

**Given** the underlying Sandbox requires re-initialization on resume
**When** this happens
**Then** the user sees a "Reconnecting…" status with full history visible and input disabled, re-enabling once ready
**And** the git identity from Story 1.5 is re-injected into git config at this resume, not only at initial provision

**Given** `apps/agent-be` is deployed or restarted
**When** the process receives `SIGTERM`
**Then** shutdown hooks notify all clients with active SSE connections that the connection is draining, before the process exits
**And** notified clients can reconnect and resume their Conversation without losing chat history, rather than the connection being hard-killed with no notice
**And** turn/session state is persisted to Postgres on every turn, so a restart does not lose Conversation history

**Given** an in-progress Artifact on the Project Map has a Conversation already open in another browser tab
**When** the user clicks that Artifact
**Then** the existing Conversation tab is brought into focus instead of opening the Artifact Browser (FR8), completing the click behavior Story 2.6 deferred to this epic

### Story 3.6: Track and Manually Save Working Tree State

As a user mid-Conversation,
I want to see whether my in-progress work has been saved to the repository, and save it on demand,
So that I don't lose work and don't have to wait for the Agent to decide when to commit.

**Acceptance Criteria:**

**Given** an active Conversation with a Sandbox
**When** the working tree has uncommitted changes
**Then** the chat input area shows `● Unsaved changes` (amber); when clean, it shows `✓ All saved` or is hidden (FR14, UX-DR7)
**And** the indicator updates after each agent action or manual save, and uses `aria-live="polite"` so changes are announced

**Given** the indicator is in the dirty state
**When** the user clicks it
**Then** a "Save current progress?" confirmation popover appears with Save/Cancel
**And** confirming executes a platform-level commit inside the Sandbox, bypassing the Agent, completing within 5 seconds of execution (NFR-P5)
**And** the commit uses the message format `chore(platform-save): checkpoint [<ISO8601 UTC timestamp>]`, not shown in the chat UI

**Given** a save is triggered while an agent turn is in progress
**When** the user confirms
**Then** the indicator shows "Saving after response…" and the commit fires once the agent is next idle

**Given** a manual save succeeds
**When** it completes
**Then** a Semantic Pill indicating the manual save appears inline at that position, and the indicator resets to clean

**Given** a manual save fails
**When** the error occurs
**Then** an error-state Tool Pill (same presentation as a failed agent tool call) is shown, the indicator remains dirty, and no partial commit state is created

**Given** the working tree is already clean when a save is triggered
**When** the operation runs
**Then** it returns a no-op without error
**And** the Save control is disabled while a save is already in progress, preventing duplicate submissions

**Given** the working tree is in the dirty state
**When** the user seeks more information from the indicator (distinct from triggering the save popover)
**Then** explanatory help text is reachable explaining that closing the page or the Sandbox restarting risks losing unsaved changes, and that saving commits them to the Repository permanently

### Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation

As a user whose repository credentials fail while I'm actively working,
I want to be told immediately rather than on my next page load,
So that I can re-authorize and avoid losing more in-progress work than necessary.

**Acceptance Criteria:**

**Given** an active Conversation's git-related tool call result contains a 401/403 pattern
**When** it is detected by `tool-pill-classifier.service.ts`
**Then** it persists the failed credential health status (Story 1.6) and emits a `CREDENTIAL_FAILURE` event on the same SSE channel already carrying AG-UI events — no new transport
**And** this happens immediately, not only on the user's next page load (NFR-R1)

**Given** a `CREDENTIAL_FAILURE` event is received in an active Conversation
**When** the frontend processes it
**Then** the user sees a re-auth prompt without needing to navigate away from the Conversation

**Given** a Daytona outage affecting Sandbox provisioning
**When** a user visits the Project Map or Artifact Browser
**Then** those surfaces remain functional (pure Postgres/git reads with no Sandbox dependency); only new Conversation provisioning is blocked

### Story 3.8: Track Per-User LLM Spend

As the platform operator,
I want per-user LLM spend tracked and anomalies alerted on from day one,
So that runaway costs are caught before they become a billing or margin problem.

**Acceptance Criteria:**

**Given** a Conversation turn completes
**When** the Agent SDK reports cost for that turn
**Then** `cost-tracking.service.ts` records per-user spend from the SDK's cost reporting (NFR-O1)

**Given** a user's spend in a period exceeds an anomalous threshold
**When** the threshold is crossed
**Then** a budget alert fires and is operational at launch, not added post-launch

**Given** the Sandbox network during any Conversation
**When** the Agent or its tool calls execute
**Then** platform-internal credentials (DB connection strings, internal service API keys, platform service account tokens) are never injected into the Sandbox, and the Sandbox network has no accessible route to the agent backend's internal service endpoints (NFR-S1)

### Story 3.9: Terminate Idle Sandboxes Mid-Conversation

As the platform operator,
I want a Sandbox that has gone idle mid-Conversation (not just before the first message) to be torn down,
So that abandoned Conversations don't accrue Daytona costs indefinitely.

**Acceptance Criteria:**

**Given** an active Conversation whose Sandbox has already passed Story 3.1's pre-first-message timeout
**When** no further user message arrives for a configurable mid-session idle period (default longer than the pre-first-message timeout, to avoid penalizing users mid-Skill)
**Then** the Sandbox is torn down

**Given** the working tree is dirty when the mid-session idle timeout elapses
**When** the teardown is about to run
**Then** a platform-level save (Story 3.6's mechanism) is attempted first, so idle teardown does not silently discard uncommitted work

**Given** a Sandbox has been torn down for mid-session idle
**When** the user returns to that Conversation
**Then** the existing resume flow (Story 3.5's "Reconnecting…" state and re-provisioning) applies — idle teardown does not lose chat history, only the live Sandbox process

### Story 3.10: Verify Commits Carry the User's Own Identity

As a user whose work gets committed through a Conversation,
I want my name and email to be the actual author identity on the resulting commit, as my teammates would see it in GitHub,
So that my contribution is visibly mine, not attributed to a generic platform bot.

**Acceptance Criteria:**

**Given** a commit produced through an Agent `git commit` (Story 3.4) or a manual Save (Story 3.6)
**When** the commit is inspected via `git log` or the GitHub UI
**Then** the author name and email match the identity resolved in Story 1.5 for the user who triggered it — not a shared platform service account

**Given** two different users each commit in their own Conversation against the same repository
**When** their respective commits are inspected
**Then** each carries that user's own distinct identity, confirming attribution is per-user end-to-end and not just correct in isolation

**Given** the noreply-email fallback case from Story 1.5
**When** that user's commit is inspected
**Then** the commit author email is the `{github_username}@users.noreply.github.com` fallback, and GitHub still attributes the commit to that user's profile
