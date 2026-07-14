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

FR4: Credential Health Monitoring — Platform monitors stored Repository credentials; any git operation returning 401 updates credential health to `failed` within one operation cycle; 403 responses are classified (rate limit, org restriction, permission denial) without marking the credential as failed; Project Map shows a re-auth notification with a re-authorize flow.

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

NFR-R1: Credential health status must update within one git operation cycle of a 401 response; silent credential failures are not acceptable. A 403 is classified, not treated as a credential failure.

NFR-R2: Committed Artifacts are always recoverable from the Repository, independent of Sandbox state; uncommitted working tree state is not guaranteed to survive a Sandbox restart.

NFR-R3: The streaming transport must not silently drop events when the client is slow to consume; it must apply back-pressure and pause token emission until the client is ready.

NFR-R4: The streaming transport must support 10 concurrent agent SSE connections per browser session without connection starvation, matching the FR11 Conversation limit; a transport configuration imposing a lower browser-level connection limit is not acceptable.

**Observability**

NFR-O1: Platform must track per-user LLM spend via the Agent SDK's cost reporting from day one; budget alerting for anomalous per-user spending must be operational at launch.

### Additional Requirements

- Starter/greenfield template: Nx workspace with Yarn (`npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=yarn`), generating `apps/web` (Next.js 15, App Router, Tailwind, Turbopack), `apps/agent-be` (NestJS), `libs/shared-types`, `libs/database-schemas`. Yarn is pinned via a `packageManager` field in `package.json` and installed through Corepack, with `nodeLinker: node-modules` in `.yarnrc.yml` for Next.js/Nx compatibility. This is the first implementation story (Epic 1, Story 1).
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
- Credential failure must propagate immediately to the active session: `tool-pill-classifier.service.ts` detects 401 patterns in git-related tool call results and emits a `CREDENTIAL_FAILURE` event on the existing SSE channel (not just on next page load). A 403 mid-conversation is classified (rate limit, org restriction, permission denial) and does not emit `CREDENTIAL_FAILURE` or mark the credential as failed (per FINDING-12).
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

UX-DR4: Build streaming Message components (User, Agent) with Markdown rendered progressively during streaming (not transformed on completion), blinking cursor at the insertion point, per-message hover copy action, always-visible per-code-block copy button, and the specified timestamp display rules: relative time as the primary display on both user and agent messages — "just now" under 1 minute, "X minutes ago" 1–59 min, "X hours ago" 1–23 hr, "yesterday"/"X days ago" 24 hr–6 days, absolute date (e.g. "Jul 8") at 7 days and beyond. Absolute time remains accessible via hover but is not prominent. User message timestamps remain hover-only; agent message timestamps remain low-prominence inline. Relative timestamps update live (interval tick) while the conversation view is open. (Extended 2026-07-13 per Story 7.5 — supersedes the prior "just now under 1 minute" only rule; previously older messages showed wall-clock time.)

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

UX-DR16: Implement the accessibility floor: visible 2px accent focus rings with 2px offset on all interactive elements (never suppressed on click). Exception — navigation surfaces only (sidebar nav items, Project Map artifact cards, Artifact Browser list entries): these use `:focus-visible` so the ring appears on keyboard focus but is suppressed on mouse-click focus. Keyboard focus remains fully visible on every interactive element (WCAG 2.4.7 satisfied). Input and action surfaces (chat input; Run/Retry/Send/Save/Stop buttons; search/filter inputs; tab controls; modal controls; tree/expand-collapse toggles; copy buttons; slash-command picker) retain `:focus` — ring on all focus, never suppressed on click. (Navigation-surface exception added 2026-07-13 per Story 7.4; the existing `:focus:not(:focus-visible)` browser-default safety net in EXPERIENCE.md precedents this pattern.)

UX-DR17: Implement responsive behavior: desktop-first with a 1024px minimum supported viewport; tablet (768–1023px) collapses the side navigation into an off-canvas drawer triggered by a hamburger button; mobile is explicitly out of scope for MVP.

UX-DR18: Implement the Agent Processing state machine (Idle / Thinking / Tool executing / Streaming response) governing chat input enabled/disabled, Stop button visibility, and the active indicator (three-dot animation vs. inline tool-execution label vs. streaming cursor) — the thinking and tool-execution indicators must remain visually distinct.

UX-DR19: Implement the per-surface loading/empty/error state patterns: Project Map (loading skeleton, empty-state prompt, populated, credential-failed banner, refreshing spinner), Conversation (cold-load skeleton, history-load error with Refresh, "Reconnecting…" with full history visible and disabled input, active/idle), Artifact Browser (list-only, list+detail, loading skeleton, load-error with Refresh, credential-failed banner), Settings (static "coming soon", no states needed). Transition-loading pattern (added 2026-07-13 per Stories 7.2/7.3): in-app navigation transitions (sidebar page switches) and artifact switching in the Artifact Browser surface a content-pane dim (opacity) + small spinner, with existing content remaining visible underneath, rather than a flash of empty skeleton. This is distinct from cold-load skeletons (which apply on initial page load with no existing content). Consistent visual language across both transition surfaces.

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

### Epic 5: UX Mockup Fidelity — Close Visual Drift
A comprehensive audit identified 102 findings of visual drift between the authoritative UX mockups (7 HTML files + DESIGN.md + EXPERIENCE.md) and the implemented application across all 7 surfaces and the shared shell. Token values match exactly (42/42); the drift is structural (missing containers, wrong layouts), token-usage (wrong tokens applied), and copy-level. This epic closes the drift by restoring missing visual containers, fixing structural divergences, correcting token-usage, and addressing token-config gaps. Epic 4 is reserved and intentionally unused.
**Investigation:** `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md`

### Epic 6: Sandbox-Based Agent Execution
Migrates agent execution from host-based (`@anthropic-ai/claude-agent-sdk` `query()` subprocess) to sandbox-based execution inside the Daytona sandbox, per PRD §3 and architecture.md data flow. Story 3.3 shipped host-based execution as a deviation (DP-2); this epic brings the implementation back in line with the prescribed architecture. Fixes Stories 3.3, 3.6, and 3.10 at the execution layer.
**Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-11.md`

### Epic 7: Live-Usage UX Improvements
Five UX gaps discovered from live-app usage after Epic 5 closed. These are not mockup drift — they are live-usage findings about states and feedback that the design never fully specified (loading feedback during in-app navigation, relative timestamps beyond one minute, prominence of focus rings on navigation surfaces) and about inconsistency in how already-specified patterns render (error presentation in the conversation view). Frontend presentation changes only; independent of Epic 6.
**Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-13.md`

## Epic 1: Authentication & Repository Connection

A new user can sign in with GitHub, connect their team's BMAD-enabled repository, and have it validated and ready for use — including the foundational platform scaffold (Nx workspace, Postgres/Prisma, boundary JWT, OAuth envelope encryption, CI/CD) that every later epic builds on.

### Story 1.1: Scaffold the Platform Monorepo and CI Pipeline

As a developer on the bmad-easy team,
I want the Nx monorepo scaffolded with the web and agent-be apps, shared libs, design tokens, and a CI pipeline,
So that every subsequent feature has a consistent, deployable foundation to build on.

**Acceptance Criteria:**

**Given** an empty repository
**When** the Nx workspace is initialized per the architecture's Initialization Commands (Yarn-based, Corepack-pinned)
**Then** `apps/web` (Next.js 15, App Router, Tailwind, TypeScript strict), `apps/agent-be` (NestJS), `libs/shared-types`, and `libs/database-schemas` exist and build successfully via `nx build`
**And** `libs/database-schemas` contains the initial Prisma schema (User model at minimum) and generates a client consumed by both apps against a single Railway Postgres instance
**And** `yarn.lock` is committed to the repository and CI installs with `yarn install --immutable`

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

**Given** no `Artifact` table exists yet
**When** this story is implemented
**Then** the Prisma schema (`libs/database-schemas`) is extended with an `Artifact` model (type, title, status, lastModifiedAt, content, repoConnectionId) and a migration is generated and committed before the mirroring logic is built against it

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

**Given** no `Conversation` or `Turn` tables exist yet
**When** this story is implemented
**Then** the Prisma schema (`libs/database-schemas`) is extended with `Conversation` (owning user, stable URL id, semantic title, `last_active_at`) and `Turn` (conversation id, role, content, timestamp) models, and a migration is generated and committed — this is the schema dependency Story 3.5 (resume) and Story 3.12 (turn persistence on every turn) read and write against

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

### Story 3.5: Resume an Existing Conversation

As a user returning to work I started earlier,
I want to reopen any of my Conversations and pick up exactly where I left off,
So that navigating away never costs me context.

**Acceptance Criteria:**

**Given** a user navigates to an existing Conversation
**When** the page loads
**Then** its full chat history is restored immediately from Postgres, independent of Sandbox state (FR13, NFR-R2)

**Given** the underlying Sandbox requires re-initialization on resume
**When** this happens
**Then** the user sees a "Reconnecting…" status with full history visible and input disabled, re-enabling once ready
**And** the git identity from Story 1.5 is re-injected into git config at this resume, not only at initial provision

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

**Given** an active Conversation's git-related tool call result contains a 401 pattern
**When** it is detected by `tool-pill-classifier.service.ts`
**Then** it persists the failed credential health status (Story 1.6) and emits a `CREDENTIAL_FAILURE` event on the same SSE channel already carrying AG-UI events — no new transport
**And** this happens immediately, not only on the user's next page load (NFR-R1)

**Given** an active Conversation's git-related tool call result contains a 403 pattern
**When** it is detected by `tool-pill-classifier.service.ts`
**Then** it classifies the 403 into `RATE_LIMITED`, `ORG_RESTRICTION`, or `INSUFFICIENT_PERMISSION` (reusing the Epic 1 / Story 1.6 vocabulary) and emits an `ACCESS_DENIED` event with that `code` on the same SSE channel — it does NOT emit `CREDENTIAL_FAILURE`, does NOT call `markCredentialFailed`, and does NOT persist failed credential health (per FINDING-12; event contract defined in architecture.md)

**Given** a `CREDENTIAL_FAILURE` event is received in an active Conversation
**When** the frontend processes it
**Then** the user sees a re-auth prompt without needing to navigate away from the Conversation

**Given** an `ACCESS_DENIED` event is received in an active Conversation
**When** the frontend processes it
**Then** the failing git operation renders as an error-state Tool Pill with an Access Notice inline in the message stream below it, whose copy is derived from the event's `code` (`RATE_LIMITED` / `ORG_RESTRICTION` / `INSUFFICIENT_PERMISSION`)
**And** the Credential Error Banner does NOT appear and no re-auth prompt is shown (re-authentication resolves none of the three 403 causes, per FINDING-12)
**And** the input is not disabled and the agent turn is not halted (the tool call's error result is returned to the agent, which adapts)

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

### Story 3.11: Run Concurrent Conversations

As a user juggling multiple BMAD workflows,
I want to have several Conversations active at once,
So that I'm not blocked working through one Skill at a time.

**Prerequisites (deferred items absorbed from prior story reviews):**

- **Concurrent-turn guard** (from 3-4 review): `circuitBreakerTimers` orphaned by concurrent `runTurn` calls on same `conversationId` — no guard against concurrent invocation; second call overwrites first's `activeRuns` and `circuitBreakerTimers` entries, orphaning the first run. The 3-4 review explicitly tagged this as "Story 3.11 scope." [`apps/agent-be/src/streaming/agent.service.ts:runTurn`]
- **handleRetry leak** (from 3-2 review, originally tagged 3-5 scope but unresolved): `handleRetry` mints a new conversation on every click when `initialConversationId` is undefined — previous in-flight provisioning not cancelled; leaks Daytona sandboxes and DB rows. Story 3.5 shipped without resolving this; it lands here. [`apps/web/src/components/conversation/ConversationPane.tsx:275`]

**Acceptance Criteria:**

**Given** a user has fewer than 10 active Conversations
**When** they open a new one
**Then** it runs with an independent Sandbox and chat history at its own stable URL (FR11)
**And** the SSE transport supports 10 concurrent connections per browser session without connection starvation, requiring an HTTP/2-capable reverse proxy in front of `apps/agent-be` (NFR-R4)

**Given** a user already has 10 active Conversations
**When** they attempt to open another
**Then** they see a "session limit reached" message rather than a silent failure (FR11)

**Given** a second `runTurn` is invoked on a `conversationId` that already has an in-flight agent turn
**When** the second call arrives
**Then** it is rejected or queued — not allowed to overwrite the first turn's `activeRuns` and `circuitBreakerTimers` entries — so the first turn is not orphaned mid-execution

**Given** a user clicks retry while in-flight provisioning for a new conversation is already running and `initialConversationId` is undefined
**When** the retry click fires
**Then** the previous in-flight provisioning is cancelled (Daytona sandbox torn down, DB row removed) before minting a new conversation, so retry does not leak sandboxes and rows across repeated clicks

### Story 3.12: Drain Conversations Gracefully on Deploy

As a user with an active Conversation when the platform deploys a new version,
I want my connection to end cleanly and let me reconnect without losing history,
So that routine deploys never look like a crash or lose my work.

**Prerequisites (deferred items absorbed from prior story reviews):**

- **In-memory sandbox state, no recovery on restart** (from 3-1/3-3 reviews): `sandboxStatuses` and `sandboxIds` are in-memory `Map`s, never persisted to DB. Server restart loses all sandbox state — `getStatus` reports `'provisioning'` (fallback) for conversations whose sandboxes are ready or dead. Sandboxes orphaned in Daytona with no record to destroy. Graceful drain requires knowing what's running; this must be persisted to Postgres. [`apps/agent-be/src/conversations/conversations.service.ts`]
- **ManualCommitService.onModuleDestroy drops pending commits** (from 3-6 review): `onModuleDestroy` silently drops pending commits without emitting `MANUAL_SAVE_FAILED`. The 3-6 spec said "clear pending commits on shutdown," but draining must either complete or notify — silent drop loses work. [`apps/agent-be/src/conversations/manual-commit.service.ts:91-93`]
- **Dependency (confirm resolved, not fixed here):** `SandboxService.resume` returns `conversationId: sandboxId` — conflates sandbox ID with conversation ID (from 3-1/3-2 reviews, tagged 3-5 scope but 3-5 shipped without resolving). This story's "clients can reconnect and resume" AC depends on resume returning the correct conversationId. Verify 3-5 resolved it; if not, resolve as part of this story. [`apps/agent-be/src/sandbox/sandbox.service.ts:64`]

**Acceptance Criteria:**

**Given** `apps/agent-be` is deployed or restarted
**When** the process receives `SIGTERM`
**Then** shutdown hooks notify all clients with active SSE connections that the connection is draining, before the process exits
**And** notified clients can reconnect and resume their Conversation without losing chat history, rather than the connection being hard-killed with no notice
**And** turn/session state is persisted to Postgres on every turn — via the `Turn` model migrated in Story 3.1 — so a restart does not lose Conversation history

**Given** `apps/agent-be` restarts (deploy, crash, or scaling) and a client reconnects to an existing Conversation
**When** the client calls `getStatus` for that Conversation
**Then** it reports the correct sandbox status (ready, failed, or not-found) — not a fallback `'provisioning'` — because sandbox state is persisted to Postgres rather than held only in-memory `Map`s that are lost on restart

**Given** a manual save is pending in `ManualCommitService` when `SIGTERM` is received
**When** `onModuleDestroy` runs
**Then** the pending commit is either completed before exit or the client is notified via a `MANUAL_SAVE_FAILED` event on the SSE channel before the process exits — pending saves are never silently dropped during drain

## Epic 5: UX Mockup Fidelity — Close Visual Drift

A comprehensive audit (`_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md`) identified 102 findings of visual drift between the authoritative UX mockups (7 HTML files + DESIGN.md + EXPERIENCE.md) and the implemented application across all 7 surfaces and the shared shell. Token values match exactly (42/42); the drift is structural (missing containers, wrong layouts), token-usage (wrong tokens applied), and copy-level. This epic closes the drift by restoring missing visual containers, fixing structural divergences, correcting token-usage, and addressing token-config gaps. The mockups are authoritative; the code aligns to them.

### Story 5.1: Restore Missing Visual Containers Across Surfaces

As a user,
I want each screen to match its designed visual container structure,
So that the app looks polished and intentional rather than unfinished.

**Acceptance Criteria:**

**Given** the sign-in page
**When** it renders
**Then** a bordered auth card (`bg-surface border border-border rounded-xl p-8`) wraps the OAuth button, with a brand logo box above the heading, a heading, and a legal footer — matching the mockup structure (investigation: `apps/web/src/app/sign-in/page.tsx:17-43` vs `ux-designs/.../mockups/key-signin.html:79-91,105-115`)
**And** the auth card, logo box, heading, and footer are not present in the current implementation and must be added

**Given** the onboarding Repository URL input
**When** it renders
**Then** the input and its supporting copy sit inside a form panel (`bg-surface border border-border rounded-xl p-7`) — matching the mockup (investigation: `apps/web/src/components/onboarding/RepositoryUrlForm.tsx:39,55-69` vs `key-onboarding.html:98-106`)

**Given** the onboarding BMAD-initialization-failed / repository-not-found blocking state
**When** it is shown
**Then** a styled panel (`bg-negative-bg border border-negative rounded-lg p-4`) renders with the blocking message and documentation link — not a plain inline message (investigation: `RepositoryUrlForm.tsx:55-69` vs `key-onboarding.html:213-233`)

**Given** the Settings page
**When** it renders
**Then** the designed "coming soon" empty-state is present (icon, title, body, teaser items) — not a bare placeholder (investigation: `apps/web/src/app/settings/page.tsx:10-12` vs `key-settings.html:184-247,304-332`)

**Given** an artifact selected in the Artifact Browser
**When** the artifact has frontmatter metadata
**Then** a frontmatter metadata badge renders in `ArtifactViewer` showing the metadata fields — not absent (investigation: `apps/web/src/components/artifact-browser/ArtifactViewer.tsx:9-11,89-103` vs `key-artifact-browser.html:264-297,446-456`)

**Given** the conversation chat input area
**When** it renders
**Then** the textarea, Send button, and WorkingTreeIndicator sit inside a single bordered `chat-input-box` container — not as sibling elements in the input zone (investigation: `apps/web/src/components/conversation/ChatInput.tsx:59-94` vs `key-conversation.html:326-334`)

### Story 5.2: Fix Shared Shell and Page-Header Structural Drift

As a user navigating the platform,
I want the shell and page headers to match the design,
So that navigation feels consistent and polished on every page.

**Acceptance Criteria:**

**Given** the side navigation brand mark
**When** it renders
**Then** it shows a wordmark `bmad·easy` with an accent-colored interpunct between the words — not `bmad-easy` (investigation: `apps/web/src/components/shell/SideNavigation.tsx:30-31` vs `key-project-map.html:78-79`)

**Given** the bottom-pinned settings entry in the side navigation
**When** it renders
**Then** a visible "Settings" text label appears next to the avatar circle — not avatar-only (investigation: `SideNavigation.tsx:88-99` vs `key-project-map.html:300-303`)

**Given** the Project Map and Artifact Browser links in the side navigation
**When** the conversation list has fewer than 5 entries
**Then** the separator and nav links remain grouped with the conversation list (top-clustered), not pushed toward the bottom of the nav by a flex-grown conversation container — matching the mockup's layout where the separator and nav links sit inside the same flex container as conversations (investigation: `SideNavigation.tsx:41-60` vs `key-project-map.html:96-100,287-298`)

**Given** the active nav item
**When** it renders
**Then** it uses the inset pill styling from DESIGN.md, not a full-width bar (investigation: Shell Finding, active-state styling)

**Given** navigation items in the side navigation
**When** they render
**Then** horizontal padding is not doubled relative to the mockup (investigation: Shell Finding, double horizontal padding)
**And** item spacing and alignment match the mockup (investigation: Shell Finding, nav item spacing/alignment)

**Given** a depth-1 page header (Conversation, Artifact Browser, Settings, New Conversation)
**When** it renders
**Then** the Breadcrumb renders inline beside the page title on a single flex row — not stacked above the title as its own row with `py-4` padding (investigation: Shell Finding 14, breadcrumb stacked vs inline)

**Given** depth-1 page headers (Conversation, Artifact Browser, Settings, New Conversation)
**When** they render
**Then** a 1px header bottom divider (`border-b`) is present on each — currently missing on all depth-1 pages (investigation: Shell Finding 15, missing header bottom divider)

**Dev Notes:**

- The two shell findings flagged by the investigation's Missing Evidence have been resolved: both are confirmed drift, not intentional redesigns. (a) Nav links relocated from a top-grouped cluster to bottom-pinned — DESIGN.md (§Side Navigation, items 5–6) and EXPERIENCE.md (§Side Navigation, items 5–7) both specify Project Map and Artifact Browser links in the main navigation flow after the separator, not bottom-pinned; the mockup (`key-project-map.html:287-298`) groups them inside `.nav-conversations` (flex:1) with the conversation list. The implementation's separate `flex-1` conversation container (present since the first commit, `659258e`, 2026-07-01) was never a deliberate relocation — no commit, proposal, or decision logs a layout change. (b) "Settings" label removed — DESIGN.md (§Side Navigation, item 6) states "Settings label appears as tooltip or beside it"; the mockup (`key-project-map.html:302`) renders a visible `<span class="nav-bottom-label">Settings</span>`. The label was never present in the code (absent since first commit) — an oversight, not a removal. Per the Epic 5 principle (line 931: "The mockups are authoritative; the code aligns to them"), all ACs in this story should be implemented as written.

### Story 5.3: Fix Conversation Stream Structural Drift

As a user in a conversation,
I want the chat interface to match the design,
So that messages, input, and session states feel integrated and readable.

**Acceptance Criteria:**

**Given** an active conversation
**When** the messages and chat input render
**Then** both are centered in an 824px column (investigation: Conversation Finding, 824px column not centered)

**Given** the new-conversation page with no active conversation
**When** it renders
**Then** the rich empty-state (icon, title, and a `<kbd>` keyboard-hint element) is present — not a simplified/bare placeholder (investigation: Conversation Finding, new-conversation empty-state simplified)

**Given** the session-starting state ("Starting session…")
**When** it renders
**Then** the `SessionStartSpinner` is centered in the chat-messages panel — not rendered in the input area (investigation: Conversation Finding, SessionStartSpinner in wrong zone)

**Given** a disabled Send button (the agent is responding or the input is empty)
**When** it renders
**Then** it uses the muted-surface treatment — not `opacity-50` over the active style (investigation: Conversation Finding, disabled Send button styling)

**Given** conversational micro-drift items
**When** the conversation renders
**Then** placeholders match the mockup copy, the inter-message gap matches the mockup, user-bubble padding matches the mockup, the scroll-to-bottom button text color matches the mockup, and the semantic-pill separator uses the mockup's opacity (investigation: Conversation Findings, copy/placeholder drift)

**Dev Notes:**

- The inline tool/semantic pills AC was originally part of this story but has been split into Story 5.5 ("Interleave Tool and Semantic Pills Within the Agent Markdown Stream") because it requires a data model refactor, not just a visual fix. Implement Story 5.5 before or independently of this story — the remaining ACs here (column centering, empty-state, spinner placement, button styling, micro-drift) are genuine visual drift fixes with no architectural impact.

### Story 5.4: Fix Token-Usage Drift and Token-Config Gaps

As a developer maintaining the design system,
I want tokens used correctly and config gaps closed,
So that drift doesn't recur and the design system is enforced.

**Acceptance Criteria:**

**Given** project-map artifact cards
**When** they are hovered
**Then** the border uses `hover:border-accent` — not `hover:border-text-3` (investigation: Project-Map Finding, token-usage drift)

**Given** the onboarding Repository URL input
**When** it renders
**Then** the input background is `bg-bg` (recessed) — not `bg-surface` (raised) — and the label uses `text-text-1` — not `text-text-2` (investigation: `RepositoryUrlForm.tsx:53` vs `key-onboarding.html:128-135`)

**Given** the Retry and Save buttons in the conversation
**When** they render on an accent surface
**Then** their text color uses `text-accent-fg` — not `text-bg` (investigation: Conversation Finding, token-usage drift on accent buttons)

**Given** artifact-browser list entries
**When** they are hovered or display last-modified dates
**Then** the hover background uses `hover:bg-surface-raised` (no `/60` opacity modifier) and dates use `text-text-3` — not `text-text-2` (investigation: Artifact-Browser Findings, token-usage drift)

**Given** shell hairline dividers
**When** they render
**Then** `border-border-subtle` is replaced with `border-surface-raised` — or, if `border-subtle` is the intended token, it is added to DESIGN.md as a documented token before continued use (investigation: Shell Finding, token-usage drift on hairlines)

**Given** scrollable panels on the 3 affected surfaces (shell, conversation, artifact-browser)
**When** they overflow and scroll
**Then** scrollbars are hidden via `scrollbar-width: none` and `::-webkit-scrollbar { display: none }` defined in `apps/web/src/app/global.css` or as a reusable utility class (investigation: Finding 5 mechanism 5, missing scrollbar hiding)

**Given** the Tailwind config at `apps/web/tailwind.config.ts`
**When** it is updated
**Then** a `boxShadow: { floating: '0 8px 24px rgba(0,0,0,0.4)' }` token is added, matching DESIGN.md line 327 (investigation: Finding 2, gap 2)

**Given** the `WorkingTreeIndicator` component
**When** it renders as a floating element
**Then** it uses the new `floating` box-shadow token — not Tailwind's default `shadow-lg`, which has a different value (investigation: Finding 2, gap 2)

**Given** the Tailwind config at `apps/web/tailwind.config.ts`
**When** it is updated
**Then** a `fontWeight` override is added enforcing the DESIGN.md constraint `regular=400, medium=500, semibold=600` and blocking weights above 600 (e.g. `font-bold`, `font-extrabold`) (investigation: Finding 2, gap 1; DESIGN.md line 445)

**Given** the Tailwind config's use of `theme.extend`
**When** the design-system enforcement is evaluated
**Then** the team considers replacing `extend` for tokenized categories (colors, spacing, radii, font) with full `theme` overrides so non-design-system defaults (`text-red-500`, `bg-gray-400`, `rounded-3xl`, etc.) are no longer available alongside the design system (investigation: Finding 2, gap 3)

**Dev Notes:**

- Replacing `theme.extend` with full `theme` overrides (the final AC) is structural and may surface latent non-design-system usage in existing code. Stage it carefully: grep the codebase for default-palette utilities first, migrate any real uses to design-system tokens, then switch to full overrides so the change is a guardrail, not a regression.
- The ACs above treat token-correctness as the success bar; a pixel-level screenshot diff is called out as Missing Evidence in the investigation and is out of scope for this story.

### Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream

As a user watching the Agent work,
I want tool calls and recognized actions to appear inline within the agent's response at the exact position they occurred,
So that I can follow the Agent's reasoning and actions as a single continuous narrative, not as disconnected events above or below the message.

> ⚠️ **ARCHITECTURAL SCOPE WARNING:** This story is NOT a visual/CSS fix. It requires changing the `ChatMessage` data model, SSE event handlers, the agent message rendering pipeline, and the `Turn` persistence format. It was split out of Story 5.3 because its scope is architectural, not visual drift. Cross-reference: Story 3.4 (tool pill ACs), UX-DR5 ("inline chip at the exact stream position of the tool call"), FR-12, DESIGN.md Tool Pill spec, EXPERIENCE.md Tool Pills and Semantic Pills pattern.

**Prerequisites:**

- **Spec cross-references (all already require inline positioning):**
  - FR-12 (epics.md): "Every agent tool call produces an inline Tool Pill at the point of occurrence"
  - UX-DR5 (epics.md): "inline chip at the exact stream position of the tool call"
  - Story 3.4 AC1 (epics.md): "an inline 'Running… [tool name]' label appears in the chat stream at that exact position" + "replaced in place — at the same stream position, with no layout shift"
  - EXPERIENCE.md (line 141): "Tool Pills appear inline in the message stream at the position where the agent tool call occurred"
  - DESIGN.md (line 381): "inline chip in the agent message stream at the exact position the tool call occurred"
- **Investigation reference:** `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` — Conversation Finding: inline pills rendered as standalone rows
- **Current implementation analysis:**
  - `ChatMessage` type (`apps/web/src/components/conversation/types.ts`): has `toolCall?: ToolCallData` — tool calls are separate flat entries with empty `content`, not interleaved within an agent message's text
  - `ConversationPane.tsx` (lines 314-329): `TOOL_CALL_START` handler pushes a new entry to the `messages` array instead of inserting into the streaming agent message at the current stream position
  - `ChatMessageList.tsx` (lines 84-103): renders tool calls as standalone `<div>` blocks between messages, not inline within markdown
  - `agent.service.ts` (lines 178-188): persists only `accumulatedText` (flat string) to `Turn.content` — tool call positions are not persisted, meaning resumed conversations lose tool pills entirely

**Acceptance Criteria:**

**Given** an agent is streaming a response and makes a tool call mid-stream
**When** the `TOOL_CALL_START` event arrives
**Then** a "Running… [tool name]" indicator renders inline within the agent's markdown stream at the exact position the tool call occurred — not as a standalone row above or below the message

**Given** a tool call completes during an agent's streaming response
**When** the `TOOL_CALL_RESULT` event arrives
**Then** the "Running…" indicator is replaced in place — at the same stream position, with no layout shift to surrounding content — by the completed Tool Pill showing the tool name and short status

**Given** the Agent performs a `git commit` that is confirmed successful
**When** the commit is recognized
**Then** its Tool Pill is promoted in place to a Semantic Pill ("Progress saved" with artifact type, title, and "View" link) at the same stream position where the tool call occurred

**Given** a tool call fails during an agent's streaming response
**When** the failure is received
**Then** an error-state Tool Pill renders inline at the position where the tool call occurred — not as a standalone row — and the FR-14 working-tree indicator remains dirty if applicable

**Given** an `ACCESS_DENIED` event is received for a failing git operation mid-conversation
**When** the frontend processes it
**Then** the Access Notice renders inline directly below the error-state Tool Pill within the agent's markdown stream — not as a standalone row

**Given** a manual save (Story 3.6) completes during or after an agent's response
**When** the Semantic Pill for the manual save is emitted
**Then** it renders inline at the position in the stream where the save event occurred

**Given** the `ChatMessage` data model
**When** it is updated to support interleaved tool calls
**Then** tool calls are stored as position-marked elements within an agent message's content (not as separate flat array entries with empty `content`), preserving the order they occurred relative to the surrounding text

**Given** the `ConversationPane.tsx` SSE event handlers for `TOOL_CALL_START`, `TOOL_CALL_RESULT`, `TOOL_CALL_PROMOTED`, `CREDENTIAL_FAILURE`, and `ACCESS_DENIED`
**When** they process events
**Then** they insert/update tool call elements within the currently-streaming agent message at the current stream position, not as new entries in the `messages` array

**Given** a conversation is resumed (Story 3.5) after being persisted
**When** the chat history loads from Postgres
**Then** tool pills and semantic pills are restored at their original positions within the agent's messages — not lost or rendered as standalone rows — because the `Turn` persistence format captures tool call positions relative to the message text

**Given** the `AgentMessage` rendering component
**When** it renders an agent message containing interleaved tool calls
**Then** tool pills, semantic pills, and access notices render at their correct positions within the rendered markdown, with no layout shift when expanding/collapsing a pill

**Dev Notes:**

- **Current data model:** `ChatMessage` has `toolCall?: ToolCallData` as an optional property on a flat message entry. Tool calls are stored as separate entries in the `messages` array with empty `content` fields. The fix requires either (a) a `segments` array on agent messages containing `{ type: 'text' | 'tool_call', content, position }` entries, or (b) a position-marked inline format within the message text. Approach (a) is recommended — it's cleaner to render and persists naturally.
- **Backend persistence gap:** `agent.service.ts` currently persists only `accumulatedText` (a flat string) to `Turn.content`. Tool call metadata is not persisted positionally. The developer must determine whether the `Turn` model needs a schema migration (changing `content: String` to a structured format like `Json`) or whether tool call positions can be reconstructed from the SSE event log. If tool calls are not persisted, conversation resume will show text-only messages without pills — a regression from the current behavior (which at least shows them as standalone rows).
- **Event ordering:** Tool call events (`TOOL_CALL_START`, `TOOL_CALL_RESULT`, `TOOL_CALL_PROMOTED`) arrive interleaved with text token events. The current handler treats them as separate message entries. The new handler must insert them into the currently-streaming agent message at the position corresponding to the current text cursor — the point in `accumulatedText` where the tool call interrupted the stream.
- **Scope boundary:** This story does NOT change the SSE event contract, the backend event emission logic, or the `tool-pill-classifier.service.ts` classification logic. It changes only how the frontend stores and renders the events it receives, and how the backend persists turn content for resume.
- **Test coverage impact:** `ConversationPane.test.tsx` has extensive `TOOL_CALL_*` tests (lines 642-940+) that assert pills appear as entries in the `messages` array. These must be updated to assert inline positioning within agent messages instead. Budget time for significant test refactoring.
- **Cross-epic risk:** Stories 3.7 (credential failure), 3.9 (sandbox teardown), and 3.12 (graceful drain) have event handlers that update tool call state by matching `toolCallId` in the flat `messages` array. These update patterns (`m.toolCall && m.toolCall.toolCallId === toolCallId`) must be adapted to work with the new interleaved data model — the `toolCallId` lookup now traverses segments within agent messages, not top-level message entries.

## Epic 6: Sandbox-Based Agent Execution

Migrates agent execution from host-based (`@anthropic-ai/claude-agent-sdk` `query()` subprocess) to sandbox-based execution inside the Daytona sandbox, per PRD §3 (lines 100, 105, 258, 262, 318, 479) and architecture.md data flow (line 668). Story 3.3 shipped host-based execution as a deviation (DP-2); this epic brings the implementation back in line with the prescribed architecture. Fixes Stories 3.3 (execution), 3.6 (working tree), and 3.10 (commit identity) at the execution layer.

**Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-11.md`

**Process note — pattern-establishment all-files map (from Epic 5 retro action item #6):** every story in this epic that establishes or modifies a pattern (canonical headers, `no-scrollbar` utility, design-system tokens) must include an all-files matching-pattern map in its spec. The dev must audit completion against that map at review time. This is the process change that would have caught the `conversations/[conversationId]/loading.tsx` canonical header miss (Epic 5 L1, now resolved).

### Story 6.1: Install sandbox-agent + Claude Code Binaries in Sandbox During Provision

As a developer on the bmad-easy team,
I want both the sandbox-agent and Claude Code binaries deployed inside the Daytona sandbox during provisioning,
So that the agent can run inside the sandbox where the repository lives, not on the host.

**Acceptance Criteria:**

**Given** a Sandbox is provisioned (Story 3.1 provision sequence)
**When** provisioning completes
**Then** the sandbox-agent binary (rivet-dev, pinned exact version) is installed inside the sandbox, checksum-verified against a pinned hash
**And** the Claude Code binary is installed inside the sandbox, pinned to an exact version
**And** `ANTHROPIC_API_KEY` is injected into the sandbox environment so the Claude Code agent can authenticate with the Anthropic API
**And** `networkAllowList` egress control is applied to the sandbox, scoped to GitHub, the Anthropic API, and required package registries — closing the credential exfiltration path
**And** the provision sequence is extended: provision → apply `networkAllowList` → install binaries → clone (or restore on resume) → inject git identity → `git status --porcelain` → emit working-tree event → emit session-ready

**Given** `ANTHROPIC_API_KEY` is not set in `apps/agent-be`'s environment
**When** a provision is attempted
**Then** it fails loudly at startup (Zod env validation), not silently after the sandbox is running

**Given** the `networkAllowList` is applied
**When** the agent attempts an outbound network call to a non-allow-listed host
**Then** the call is blocked at the sandbox network boundary

**Given** a sandbox-agent binary version upgrade is proposed
**When** it is reviewed
**Then** the JSONL→AG-UI event mapping changelog is diffed and validated against a recorded BMAD session replay before the version is bumped (PR-review checklist, not an automated test)

**Dev Notes:**

- **sandbox-agent** is an open-source binary by [Rivet (rivet-dev)](https://github.com/rivet-dev/sandbox-agent), released January 2026. It handles Claude Code's JSONL stdout format and normalizes it to a structured event stream. Supported agents include Claude Code, Codex, OpenCode, and Amp. Sources: [GitHub](https://github.com/rivet-dev/sandbox-agent), [Rivet changelog](https://rivet.dev/changelog/2026-01-28-sandbox-agent-sdk/), [sandboxagent.dev](https://sandboxagent.dev/).
- **Binary installation mechanism:** both binaries are deployed inside the sandbox during provision (file upload or download). Pin sandbox-agent to an immutable version; checksum-verify in the Dockerfile layer. The architecture documents the upgrade protocol: "Pin to an exact binary version in the Dockerfile (no floating tags). Before any upgrade: diff the JSONL→AG-UI event mapping in the release changelog."
- **`networkAllowList` constraints:** Daytona's egress firewall is capped at 10 IPv4 CIDR entries with no hostname support. All tiers get pre-whitelisted access to package registries (npm, PyPI), GitHub/GitLab, container registries, and AI/ML APIs (Anthropic, OpenAI) regardless of custom allow-list entries. The custom allow-list closes the exfiltration path for sandbox-resident credentials (`GITHUB_TOKEN`, `ANTHROPIC_API_KEY`).
- **Credential exposure risk:** per Daytona's Security Exhibit, any secret placed inside a sandbox's environment is readable and exfiltratable by the agent process. `networkAllowList` is the cheap, available-now mitigation. Host-mediated git operations (routing git through agent-be with a credential helper that never writes the raw PAT into the sandbox) is a longer-term structural option for the risk register, not in scope for this epic.
- **Env validation:** add `ANTHROPIC_API_KEY` as a required string to `apps/agent-be/src/config/env.validation.ts` (Zod schema). Do NOT add `AGENT_WORKDIR` (irrelevant after Epic 6 — the agent runs inside the sandbox, not on the host).
- **Existing provision code:** `SandboxService.provision()` (Story 3.1) currently provisions the sandbox, clones the repo, injects git identity, and emits session-ready. This story extends the provision sequence — the new steps (binary installation, `networkAllowList`, `ANTHROPIC_API_KEY` injection) are inserted before the clone step.
- **`ISandboxService` test seam:** `SandboxServiceFake` must be updated to reflect the new provision steps (binary installation, `networkAllowList` application) so integration tests can assert on them.
- **SandboxService fidelity audit findings (CF3, 2026-07-14):** the fidelity audit (`_bmad-output/test-artifacts/sandbox-service-fidelity-audit-2026-07-14.md`) found 5 false-confidence gaps in SandboxService tests. This story touches the provision sequence and SandboxService directly — fix the 3 findings that fall in its scope:
  - **F1 (Gap A+B):** `destroy()` has zero SDK-boundary test coverage. `isNotFoundError()` (`sandbox.service.ts:179-185`) uses string matching (`includes('not found') || includes('404')`) instead of the real `DaytonaNotFoundError` class (`@daytonaio/sdk` errors/DaytonaError.d.ts) with `statusCode === 404`. Fix: replace string heuristic with `err instanceof DaytonaNotFoundError || (err instanceof DaytonaError && err.statusCode === 404)`. Add SDK-boundary tests for `destroy()` using `mock-daytona.ts` (both not-found idempotent-return and non-404 error-propagation paths).
  - **F2 (Gap A+C):** `provision()`'s catch-block cleanup (`sandbox.service.ts:39-45`) is dead code — `daytona.create` either resolves (sandbox assigned) or rejects (sandbox never assigned), so `if (sandbox)` is always false in the catch. The "no zombie sandboxes" integration test (`sandbox-lifecycle.integration.spec.ts:140-148`) is vacuously true because `SandboxServiceFake.failNextProvision` throws before allocation. Fix: either delete the dead branch (the SDK's `create` already waits for readiness internally) or implement real partial-allocation cleanup by surfacing the sandbox ID from `DaytonaError` metadata. If deleting, update the integration test to use `mock-daytona` at the SDK boundary to model the real partial-allocation failure mode.
  - **F3 (Gap C):** `resume()`'s `daytona.start(sandbox)` call (`sandbox.service.ts:67`) is only tested against the success-only mock (`mock-daytona.ts:107`). The real contract throws `DaytonaTimeoutError` / `DaytonaError` on start failures and lets sandboxes enter non-recoverable error states. Add a test with `mockDaytona.start.mockRejectedValueOnce(new DaytonaTimeoutError(...))` and assert the error propagates to the caller. Consider whether `sandbox.recover()` (exists on the `Sandbox` class) should be called before re-throwing.

### Story 6.2: Implement agui-event-bridge.service.ts

As a developer on the bmad-easy team,
I want the `agui-event-bridge.service.ts` created to receive sandbox-agent's normalized event stream and re-encode it as AG-UI events,
So that the browser SSE channel receives properly formatted AG-UI events from the in-sandbox agent.

**Acceptance Criteria:**

**Given** `agui-event-bridge.service.ts` is listed in the architecture (line 575) but was never created
**When** this story is implemented
**Then** the service receives sandbox-agent's normalized event stream via Daytona's `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` API
**And** re-encodes the stream as AG-UI events for the browser SSE channel
**And** it does NOT parse raw JSONL — sandbox-agent handles JSONL→structured-event normalization; the event bridge only re-encodes
**And** the circuit breaker (Story 3.4) wraps the event stream: if sandbox-agent fails to emit events within a timeout, the backend terminates the Claude Code agent process via the Daytona process management API before emitting an error event
**And** the SSE heartbeat (Story 3.4) runs on a fixed interval so the browser detects dead connections even when sandbox-agent is stalled

**Given** sandbox-agent crashes or stalls mid-stream
**When** the circuit breaker timeout fires
**Then** the backend calls `sandbox.process.terminateProcess(sandboxId, processId)` to terminate the agent process inside the sandbox (no longer a no-op)
**And** emits `RUN_ERROR` with `{ message: 'The agent stopped unexpectedly. Send a new message to try again.' }`
**And** cleans up the active run state

**Given** the transport mechanism
**When** agent-be receives sandbox-agent's output
**Then** agent-be creates a Daytona process session (`sandbox.process.createSession`), runs sandbox-agent inside it asynchronously (`executeCommand(..., { async: true })`), and streams output via `getSessionCommandLogs`
**And** the sandbox never initiates an outbound connection to agent-be — agent-be is the active/polling party

**Dev Notes:**

- **Transport (resolved unknown):** agent-be creates a Daytona process session (`sandbox.process.createSession`), runs sandbox-agent inside it asynchronously (`executeCommand(..., { async: true })`), and calls `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` which streams stdout/stderr back to agent-be over the authenticated HTTPS/SDK channel. The sandbox never initiates an outbound connection to agent-be. Source: network security research (`technical-network-security-between-agent-be-and-daytona-sandbox-research-2026-06-16.md`).
- **No JSONL parsing:** the project does not write its own JSONL parser. sandbox-agent handles the JSONL→structured-event normalization. The pinned-version discipline applies to sandbox-agent itself (not the JSONL format directly).
- **Existing circuit breaker + heartbeat:** Story 3.4 implemented the circuit breaker (`AgentService` timer-based, resets on every emitted event, aborts via `abortController.abort()` + `query.interrupt()`) and the SSE heartbeat (`StreamingController` comment frames on 15s interval). These were built for the host-based SDK `query()` transport. The circuit breaker's `terminateProcess` call was a no-op (Story 3.3 DP-2). After this story + Story 6.3, `terminateProcess` terminates a real sandbox process. The circuit breaker logic itself may need adaptation to work with the new transport — the `query.interrupt()` call is SDK-specific and won't exist in the sandbox-based model.
- **`ReplaySubject` buffer:** `SessionEventsService` uses `ReplaySubject<SseEvent>(100)` per conversation so late subscribers receive missed lifecycle events (Story 3.1). The event bridge emits through `SessionEventsService.emit()` for conversation-level events.
- **File location:** `apps/agent-be/src/streaming/agui-event-bridge.service.ts` (per architecture line 575). Registered in `StreamingModule`.

### Story 6.3: Migrate AgentService to Sandbox-Based Execution

As a developer on the bmad-easy team,
I want `AgentService.runTurn()` to launch the agent inside the Daytona sandbox via sandbox-agent instead of the host-based SDK `query()`,
So that the agent has direct filesystem access to the cloned repository and can read files, run git commands, and modify the working tree.

**Acceptance Criteria:**

**Given** `AgentService.runTurn()` currently uses `@anthropic-ai/claude-agent-sdk`'s `query()` function (host-based subprocess)
**When** this story is implemented
**Then** `runTurn()` launches sandbox-agent inside the sandbox via the Daytona process session API
**And** streams output via the `agui-event-bridge.service.ts` (Story 6.2)
**And** the agent has direct filesystem access to the cloned repository inside the sandbox
**And** the agent cannot access the host filesystem (`.env`, `AUTH_SECRET`, `DATABASE_URL`, `DAYTONA_API_KEY`, source code, other conversations' repos)

**Given** the user activates the Stop button during an agent turn
**When** `stop()` is called
**Then** it terminates the agent process inside the sandbox via `sandbox.process.terminateProcess(sandboxId, processId)` (no longer a no-op)
**And** the SSE channel emits the appropriate lifecycle event

**Given** the host-based `query()` import and `AGENT_WORKDIR` / `tmpdir()` cwd logic
**When** the migration is complete
**Then** the `@anthropic-ai/claude-agent-sdk` import is removed from `AgentService` (the SDK is no longer used for execution)
**And** `AGENT_WORKDIR` env var is removed (irrelevant — the agent runs inside the sandbox)
**And** the `cwd: process.env.AGENT_WORKDIR ?? tmpdir()` logic is removed

**Given** `AgentServiceFake` (test-only, implements `IAgentService`)
**When** the migration is complete
**Then** the fake is updated to reflect the new execution mechanism's side effects (DB writes, `terminateProcess` calls, SSE event emission) so integration tests assert on real behavior

**Dev Notes:**

- **What's removed:** the `@anthropic-ai/claude-agent-sdk` `query()` call, the `AGENT_WORKDIR` env var, the `cwd` fallback to `tmpdir()`, and the `query.interrupt()` abort mechanism. The SDK package itself may remain installed if other code references it, but it is no longer used for agent execution.
- **What's preserved:** the SSE event pipeline (`SessionEventsService`, `StreamingController`), the AG-UI event types, the tool-pill classifier, the cost tracking, the pending classifier promises pattern, the working-tree emission after file-modifying tool calls. These are transport-agnostic — they consume AG-UI events regardless of where the agent runs.
- **Circuit breaker adaptation:** the existing circuit breaker uses `abortController.abort()` + `query.interrupt()` to stop the agent. In the sandbox-based model, stopping the agent means calling `sandbox.process.terminateProcess(sandboxId, processId)`. The timer-based stall detection (reset on every emitted event, fire on timeout) remains the same; only the termination mechanism changes.
- **`terminateProcess` was a no-op:** Story 3.3 DP-2 documented that `terminateProcess(sandboxId, 'agent-${conversationId}')` was kept for `IAgentService` test compliance but was effectively a no-op for host-process agents. After this story, it terminates a real sandbox process.
- **Cost tracking:** the SDK's terminal `result` message carries cost data. In the sandbox-based model, sandbox-agent's normalized event stream must still surface this cost data. Verify that the `result` message (or equivalent) is part of sandbox-agent's event schema. The `Number.isFinite` guard on cost values before persisting (Story 3.8) still applies.
- **`FILE_MODIFYING_TOOLS` Set:** the module-level `Set` of Claude Code tool names that can modify the working tree (`Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`) and the fire-and-forget `getWorkingTreeStatus` check after these tool calls — these now work correctly because the agent modifies files inside the sandbox where `git status` runs. In the host-based model, these checks ran against the sandbox while the agent modified the host — they never matched.
- **Replace fabricated `MockEventSource` event shapes with recorded-session replay fixture (carry-forward from SDK fidelity retro Recommendation 2 + 2026-07-12/13 retro action items):** `ConversationPane.test.tsx` drives `MockEventSource` with hand-fabricated event shapes. The recorded-session replay fixture already exists at `apps/agent-be/test/fixtures/sdk-session-replay.jsonl` (23 messages, implemented during the SDK fidelity retro). The work is replacing the fabricated shapes in `ConversationPane.test.tsx` with this existing fixture — not creating the fixture. This closes SDK fidelity retro Finding 2 / Recommendation 2 and partially closes TD-3 for `ConversationPane`. Owner: Murat for the testing pattern; Amelia for the test files.

### Story 6.4: Verify Working Tree, Commit, and Credential Flows

As a developer on the bmad-easy team,
I want the working-tree tracking, manual commit, and credential detection flows verified against the sandbox-based execution,
So that the Stories 3.6, 3.7, and 3.10 flows that were broken by host-based execution now work correctly.

**Acceptance Criteria:**

**Given** the agent modifies files inside the sandbox (via `Write`, `Edit`, `Bash` tool calls)
**When** `getWorkingTreeStatus` runs after a file-modifying tool call
**Then** `WORKING_TREE_DIRTY` fires with the changed files (because the agent and the working tree are now in the same filesystem)
**And** the working-tree indicator (Story 3.6) shows `● Unsaved changes`

**Given** the user triggers a manual save (Story 3.6)
**When** the commit executes inside the sandbox via Daytona process exec
**Then** there are actual changes to commit (the agent's file modifications are in the sandbox)
**And** the commit carries the user's git identity (Story 3.10 / Story 1.5)
**And** the working-tree indicator resets to clean

**Given** the agent runs a git command that hits a 401/403 (e.g., `git push` with an expired token)
**When** the tool-pill classifier (Story 3.7) inspects the tool call result
**Then** credential failure detection triggers (because git commands now run inside the sandbox where the credential is injected)
**And** `CREDENTIAL_FAILURE` or `ACCESS_DENIED` events emit to the browser

**Given** the host-based execution code path
**When** verification is complete
**Then** no agent file operations happen on the host filesystem — all file operations happen inside the sandbox

**Dev Notes:**

- **Why these flows were broken:** in the host-based model, the agent modified files on the host (via `tmpdir()`), but `getWorkingTreeStatus` and manual commit ran against the sandbox via Daytona process exec. The two filesystems were disconnected — the agent's changes never appeared in the sandbox's working tree. `WORKING_TREE_DIRTY` never fired, manual commit had nothing to commit, and git credential detection never triggered because the agent couldn't run git against the sandbox repo.
- **Why they work now:** with sandbox-based execution, the agent runs inside the sandbox where the repository is cloned. File modifications, git commands, and working-tree checks all operate on the same filesystem. The existing `getWorkingTreeStatus` / `ManualCommitService` / `tool-pill-classifier.service.ts` code should work without changes — the fix is the execution location, not the flow logic.
- **Scope:** this story is verification, not new implementation. If a flow doesn't work, the fix is in the execution layer (Stories 6.1–6.3), not in the flow logic (Stories 3.6, 3.7, 3.10). Only adapt the flow logic if the sandbox-based execution surfaces a genuine edge case the host-based model didn't exercise.
- **`executing*` Set guard:** `ManualCommitService`'s `executingCommits` Set guard (Story 3.6) still applies — concurrent commit requests for the same conversation are still prevented. The guard is transport-agnostic.
- **SandboxService fidelity audit findings (CF3, 2026-07-14):** the fidelity audit (`_bmad-output/test-artifacts/sandbox-service-fidelity-audit-2026-07-14.md`) found 2 findings in the commit/skills paths that this story verifies:
  - **F4 (Gap C):** `commit()`'s `exitCode !== 0` failure path (`sandbox.service.ts:130-131, 139-140`) is not tested for `git add` or `git commit`. Hidden bug: `git add` writes failures to stderr, but the SDK's `ExecuteResponse.result` is stdout-only — so `throw new Error(addResponse.result)` throws `Error('')`, and the user sees `MANUAL_SAVE_FAILED { error: '' }`. The sibling `injectGitConfig` failure path IS tested (`nfr-s1.spec.ts:207-223`), giving false confidence. Fix: add failure-path tests for both `git add` and `git commit` non-zero exitCode; consider whether the error message should include the exitCode or a generic diagnostic since `result` is empty for `git add` failures.
  - **F5 (Gap C):** `listSkills()`'s catch-block silent-swallow (`sandbox.service.ts:162-165`) is never exercised. Broad `catch (err)` returns `[]` indistinguishably for "no skills", "sandbox unreachable", "sandbox archived". Also reads `result` without checking `exitCode` first. Fix: add tests for `executeCommand` rejection and non-zero exitCode; assert `[]` is returned (current behavior is acceptable but should be an explicit asserted contract, not an unexercised code path).

### Story 6.5: Real-Service E2E Verification

As a developer on the bmad-easy team,
I want Tier 3 real-service E2E tests and NFR performance tests to pass against the sandbox-based execution,
So that we can confirm the agent can read the repo, run tools, commit, and meet performance targets in a real Daytona sandbox.

**Acceptance Criteria:**

**Given** a real Daytona sandbox with sandbox-agent + Claude Code binaries installed
**When** a Tier 3 functional smoke test runs
**Then** the agent responds to a "hello" message with a streamed response
**And** the agent can read files from the cloned repository
**And** the agent can run git commands against the repo
**And** the agent can modify the working tree
**And** `WORKING_TREE_DIRTY` events fire when the agent modifies files
**And** manual commit commits the agent's changes inside the sandbox
**And** `stop()` terminates the agent process inside the sandbox
**And** the agent cannot access host filesystem (`.env`, source code, other conversations' repos)

**Given** NFR-P1 (first streamed token ≤ 1,500ms)
**When** measured against the sandbox-based execution
**Then** the first token appears within 1,500ms of the user sending a message

**Given** NFR-P2 (chat ready ≤ 10s from page open)
**When** measured against the sandbox-based execution
**Then** the chat is ready for input within 10 seconds of page open for repositories under ~200MB

**Given** `networkAllowList` egress control
**When** a negative test runs (attempt to reach a non-allow-listed host from inside the sandbox)
**Then** the call is blocked — verifying the allow-list is not silently ignored or misconfigured

**Dev Notes:**

- **Tier 3 testing:** real Daytona sandbox, real Claude Code agent, real Anthropic API. This is the only tier that can verify the sandbox-based execution end-to-end. Tiers 1–2 use `SandboxServiceFake` and `AgentServiceFake` which don't exercise the real transport.
- **NFR-P1 (first token ≤ 1,500ms):** the sandbox-based model adds transport latency (agent-be → Daytona → sandbox → sandbox-agent → Claude Code → sandbox-agent → Daytona → agent-be → SSE → browser) versus the host-based model (agent-be → SDK `query()` → SSE → browser). The NFR target must be re-measured — if the additional hops push first-token latency over 1,500ms, the NFR target may need revisiting (PM decision, not a developer decision).
- **NFR-P2 (chat ready ≤ 10s):** the provision sequence now includes binary installation (Story 6.1), which adds time. The 10-second target was set for repositories under ~200MB — binary installation may push this. Re-measure and assess.
- **Negative egress test:** the network security research recommends: "As part of the sandbox provisioning test suite, assert that a sandbox with `networkAllowList` applied cannot reach an arbitrary non-allow-listed host (e.g., attempt `curl` to a test endpoint outside the list and assert failure) — this is the only way to catch a misconfigured or silently-ignored allow-list before it reaches production."
- **Success criteria (from change proposal):** (1) Claude Code + sandbox-agent binaries run inside the sandbox; (2) agent can read files, run git, modify working tree; (3) `WORKING_TREE_DIRTY` fires; (4) manual commit works; (5) `stop()` terminates real process; (6) Tier 3 smoke passes; (7) NFR-P1 and NFR-P2 are measurable; (8) agent cannot access host filesystem; (9) `networkAllowList` applied to every provision.
- **`withArtifacts` Playwright fixture (from Epic 5 open-issues P4):** the `withArtifacts` fixture breaks on unique-constraint violations on `[repoConnectionId, path]`. Story 5.4 E2E for AC-1 (ArtifactCard hover border) and AC-5 (ArtifactListEntry hover) were removed and reduced to className-only unit tests. Fix the unique-constraint violations in the fixture and restore the E2E blocks as part of this story's E2E verification scope.
- **Auto-scroll regression E2E test (from Epic 5 open-issues P5):** the auto-scroll fix (Epic 5 M1) landed but no regression E2E test was added. Add a Playwright spec asserting Retry button visibility on `SESSION_TIMEOUT` while scrolled up — defense-in-depth against the auto-scroll regression recurring.

## Epic 7: Live-Usage UX Improvements

Five UX gaps discovered from live-app usage after Epic 5 closed. These are not mockup drift — they are live-usage findings about states and feedback that the design never fully specified (loading feedback during in-app navigation, relative timestamps beyond one minute, prominence of focus rings on navigation surfaces) and about inconsistency in how already-specified patterns render (error presentation in the conversation view). Frontend presentation changes only; independent of Epic 6.

**Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-13.md`

### Story 7.1: Unify Error State Presentation in Conversation View

As a user in a conversation,
I want every error that occurs within the conversation context to render inline in the same place and treatment as the happy-path greeting and the Claude Code error,
So that errors feel like part of the conversation, not a disconnected popup somewhere else on the page.

**Acceptance Criteria:**

**Given** the new-conversation happy-path greeting
**When** it renders
**Then** it is the reference treatment: inline in the chat-messages panel, centered in the 824px column, with the established empty-state treatment
**And** every error state that occurs within the conversation context matches this placement and visual treatment (inline, centered in the chat-messages panel) — including at minimum the sandbox-setup error ("Failed to set up the sandbox. Please try again or contact support.")

**Given** the sandbox-setup error with its Retry button
**When** it renders
**Then** the error message and the Retry action render co-located, inline in the chat-messages panel — not detached above/below the conversation flow
**And** the Retry button's behavior is unchanged — only its placement and visual treatment change

**Given** a sweep of conversation-context error states performed during implementation
**When** any additional error state is found that renders outside the conversation flow (e.g. session-start timeout, reconnect failure, history-load error)
**Then** it is brought inline to the same treatment

**Given** an error within the conversation context and the Credential Error Banner (UX-DR10)
**When** both could appear
**Then** the inline error (this story) is distinct from the Credential Error Banner — the banner is the already-specified full-width re-auth surface; this story covers sandbox/session/agent errors that belong in the conversation stream, not credential-health banners

**Scope notes:**
- Reference treatment = the happy-path new-conversation greeting.
- Presentation (placement + visual treatment) is in scope. Rewriting error message copy wholesale is out of scope — only bring copy into compliance if a message clearly violates the Voice & Tone rules (EXPERIENCE.md §Voice and Tone).
- The Retry button's behavior is unchanged.

### Story 7.2: Loading State for Sidebar Page Navigation

As a user switching pages via the sidebar nav,
I want feedback that the navigation transition is in progress,
So that the app does not appear frozen while the destination page loads.

**Acceptance Criteria:**

**Given** a sidebar navigation destination
**When** the user activates it (click or keyboard)
**Then** a visible loading state appears in the content area within the response frame, indicating navigation is in progress
**And** the loading treatment is consistent with Story 7.3 (artifact switching) — the same visual language on both surfaces

**Given** a navigation transition is in progress
**When** the destination page renders
**Then** the loading state clears and the destination content appears

**Given** the loading treatment
**When** it renders
**Then** it uses the shared transition-loading pattern specified in the UX-DR19 amendment: existing content dims via opacity with a small spinner, keeping current content visible underneath rather than flashing an empty skeleton

**Given** the sidebar item itself
**When** navigation is triggered from it
**Then** the sidebar item does not render a separate loading indicator — the content-area loading state is the single source of truth for "navigation in progress" (avoids double-signaling; the active state on the destination item already confirms the selection)

**Scope notes:**
- Applies to all sidebar nav destinations (Project Map, Artifact Browser, existing Conversations, Settings, New Conversation).
- Shared visual treatment with Story 7.3 — implement the two together.

### Story 7.3: Loading State for Artifact Switching in Artifact Browser

As a user browsing the Artifact Browser with one artifact already open,
I want loading feedback when I click another artifact to switch to it,
So that the switch does not appear to have done nothing.

**Acceptance Criteria:**

**Given** an artifact is open in the Artifact Browser and the user clicks another artifact in the list
**When** the new artifact's content is fetching
**Then** a visible loading state renders in the content pane, consistent with Story 7.2's treatment

**Given** the loading treatment for artifact switching
**When** it renders
**Then** the previously-open artifact remains visible (dimmed via opacity) until the new artifact's content is ready, with a small spinner — no flash of empty content pane

**Given** the new artifact's content arrives
**When** it renders
**Then** the loading state clears and the new artifact's rendered Markdown replaces the previous one

**Scope notes:**
- Distinct surface from Story 7.2 but the loading treatment must feel consistent (decided jointly with Story 7.2).
- The "keep previous content visible dimmed" behavior is specific to artifact switching (where the outgoing content is meaningful context); Story 7.2's page transitions use the same dim+spinner language but the outgoing page may not persist as long.

### Story 7.4: Reduce Focus State Prominence on Navigation Surfaces

As a user navigating the sidebar, Project Map, and Artifact Browser with a mouse,
I want focus rings to not create visual noise on navigation surfaces,
So that the interface feels calm — while keyboard users still get a clear focus indicator.

**Acceptance Criteria:**

**Given** a navigation-surface interactive element (sidebar nav items, Project Map nodes/artifact cards, Artifact Browser list entries)
**When** it receives focus via mouse click
**Then** no visible design-system focus ring is shown (mouse-click focus is suppressed on these surfaces)

**Given** the same navigation-surface element
**When** it receives focus via keyboard (Tab)
**Then** the visible 2px accent focus ring with 2px offset appears (keyboard focus remains fully visible, satisfying WCAG 2.4.7)

**Given** an input or action surface (chat input; Run, Retry, Send, Save, Stop buttons; search/filter inputs; tab controls; modal dialog controls; tree/expand-collapse toggles; copy buttons; the slash-command picker)
**When** it receives focus by any means (mouse or keyboard)
**Then** the visible 2px accent focus ring with 2px offset appears and is never suppressed on click (unchanged from UX-DR16's original rule)

**Given** the global CSS and the existing `:focus:not(:focus-visible)` safety net (EXPERIENCE.md line 381)
**When** the nav-surface change is implemented
**Then** navigation surfaces use the `:focus-visible` Tailwind variant (`focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface`) instead of the `:focus` variant (`focus:ring-2 ...`) — so the ring appears on keyboard focus only
**And** input/action surfaces retain the `:focus` variant (ring on all focus, never suppressed on click)

**Given** the chat input's existing focus state
**When** this story ships
**Then** it is unchanged — it is explicitly in the "keep visible" set and was not the source of the noise complaint

**Scope notes:**
- Recommended reconciliation: `:focus-visible` on navigation surfaces only; full removal of keyboard focus is explicitly out of scope (would be a separate, deliberate accessibility trade-off requiring its own sign-off and is NOT recommended here).
- "Navigation surfaces" = sidebar nav items, Project Map artifact cards, Artifact Browser list entries. Revisit action buttons, modal controls, tabs, tree toggles, copy buttons, search inputs during implementation — recommend keeping all of these on `:focus` (visible on click).

### Story 7.5: Relative Time for Conversation Timestamps

As a user reading a conversation,
I want conversation message timestamps to show relative time as the primary display,
So that I can understand recency without doing mental arithmetic against the current clock.

**Acceptance Criteria:**

**Given** an agent message timestamp
**When** it renders inline below the message (low prominence, `xs`/`text-2`, per UX-DR4)
**Then** it displays relative time as the primary text: "just now" under 1 minute; "X minutes ago" 1–59 min; "X hours ago" 1–23 hr; "yesterday" / "X days ago" 24 hr–6 days; absolute date (e.g. "Jul 8") at 7 days and beyond

**Given** a user message timestamp
**When** it renders (hover-only, per UX-DR4)
**Then** the hover affordance shows relative time as the primary text using the same threshold table
**And** absolute time remains accessible (via the same hover) but is not the prominent display

**Given** any message timestamp and the absolute time
**When** the user hovers the timestamp
**Then** the absolute time is available (tooltip / `title`) — absolute time is demoted to accessible-but-not-prominent

**Given** a conversation view that stays open
**When** time passes
**Then** relative timestamps update live on an interval (configurable, e.g. 60s) while the conversation view is visible — "just now" rolls into "1 minute ago", etc. — and stops updating when the view is unmounted

**Given** the threshold for switching from relative to absolute date
**When** a message exceeds 7 days
**Then** the primary display becomes an absolute date (e.g. "Jul 8"), with the full absolute timestamp still available on hover

**Scope notes:**
- Relative time is primary and low-prominence (not bold, not large) — consistent with UX-DR4's "low-prominence inline on agent messages."
- Live-updating is in scope (interval tick while the conversation view is open; cleared on unmount).
- Store the absolute timestamp; compute relative client-side (or server-render once and hydrate with a client interval). Implementation choice.
