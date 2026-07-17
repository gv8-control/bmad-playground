---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md'
---

# bmad-easy - Epic Breakdown

Epic and story breakdown for bmad-easy, decomposing PRD, UX, and Architecture requirements into implementable stories.

## Requirements Inventory

## Functional Requirements

FR1: Repository Connection via URL — User connects a GitHub Repository by URL; platform uses the OAuth access token (`repo` scope at sign-in) to validate write access and complete setup. No token entry field. Token stored encrypted at rest, never returned to client.

FR2: BMAD Initialization Validation — Platform validates the connected Repository contains `_bmad/`, `_bmad-output/`, `.claude/`, and that BMAD is v6.x, before activating the connection. Blocking messages with documentation links on failure (missing directories, unsupported version, no Skills found).

FR3: Commit Attribution per User — Commits produced through Conversations are attributed to the user's GitHub OAuth identity (name/email, injected into Sandbox git config at session init), not a shared platform credential.

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

## NonFunctional Requirements

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

## Additional Requirements

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
- `sandbox-agent` (JSONL→AG-UI bridge): pin to an exact binary version in the Dockerfile; before any upgrade, diff the event-mapping changelog and validate against a recorded BMAD session replay. Enforced by PR-review checklist, not a story AC.
- AG-UI packages (`@assistant-ui/react-ag-ui`, `@ag-ui/client`, `@ag-ui/core`): pin to exact versions; same changelog-review + session-replay-validation discipline before any upgrade. Enforced by PR-review checklist, not an AC.
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

## UX Design Requirements

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

## FR Coverage Map

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

## Epic 1: Authentication & Repository Connection
A new user can sign in with GitHub, connect their team's BMAD-enabled repository, and have it validated and ready for use — including the foundational platform scaffold (Nx workspace, Postgres/Prisma, boundary JWT, OAuth envelope encryption, CI/CD) that every later epic builds on.
**FRs covered:** FR1, FR2, FR3, FR4, FR18, FR19

## Epic 2: Project Map & Artifact Browser
A user can see what BMAD work the team has produced and what is in progress (Project Map), and read any committed Artifact as clean, rendered Markdown (Artifact Browser) — without opening GitHub.
**FRs covered:** FR5, FR6, FR7, FR8, FR16, FR17

## Epic 3: Conversations — Running BMAD Skills with the Agent
A user can open a Conversation, invoke BMAD Skills via slash command, converse with the streaming Agent across multiple turns, see Tool Pills and Semantic Pills for agent actions, track the working tree state, and manually save progress — with the Agent's committed output flowing into the Artifact Browser and Project Map built in Epic 2.
**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14, FR15

## Epic 4: MVP Cloud Deployment Provisioning
Provision the platform's single production environment (per architecture's "production only, no staging" constraint): `apps/web` on Vercel, `apps/agent-be` (Docker) and Postgres on Railway, secrets wired on both platforms, migrations applied, and CI able to trigger a deploy manually. Independent of Epic 2/3 sequencing; owns provisioning mechanics only, not the SSE-drain (Story 3.12) or spend-monitoring (Story 3.8) verification that depend on Epic 3 code.
**Additional Requirements covered:** deployment infra, CI/CD manual deploy trigger

## Epic 5: UX Mockup Fidelity — Close Visual Drift
A comprehensive audit identified 102 findings of visual drift between the authoritative UX mockups (7 HTML files + DESIGN.md + EXPERIENCE.md) and the implemented application across all 7 surfaces and the shared shell. Token values match exactly (42/42); the drift is structural (missing containers, wrong layouts), token-usage (wrong tokens applied), and copy-level. This epic closes the drift by restoring missing visual containers, fixing structural divergences, correcting token-usage, and addressing token-config gaps.
**Investigation:** `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md`

## Epic 6: Sandbox-Based Agent Execution
Migrates agent execution from host-based (`@anthropic-ai/claude-agent-sdk` `query()` subprocess) to sandbox-based execution inside the Daytona sandbox, per PRD §3 and architecture.md data flow. Story 3.3 shipped host-based execution as a deviation (DP-2); this epic brings the implementation back in line with the prescribed architecture. Fixes Stories 3.3, 3.6, and 3.10 at the execution layer.
**Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-11.md`

## Epic 7: Live-Usage UX Improvements
Five UX gaps discovered from live-app usage after Epic 5 closed. These are not mockup drift — they are live-usage findings about states and feedback that the design never fully specified (loading feedback during in-app navigation, relative timestamps beyond one minute, prominence of focus rings on navigation surfaces) and about inconsistency in how already-specified patterns render (error presentation in the conversation view). Frontend presentation changes only; independent of Epic 6.
**Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-13.md`

## Epic 8: Sandbox Reconciliation via Environment-Scoped Labels
Daytona sandboxes from local dev, the dev deployment, tests, and production share one account and a 30GiB disk quota, with no reconciliation mechanism — sandboxes leak on crashes, provisioning-window failures, and transient destroy failures, exhausting the quota. This epic adds an environment-scope label to every sandbox at creation time and a periodic background reaper that lists sandboxes by that label, reconciles them against the database, and destroys orphans. Defense-in-depth for the in-process cleanup paths in Epic 3 (Stories 3.1, 3.9, 3.12) that cannot run when the process crashes.
**Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-17-sandbox-reaper.md`

## Table of Contents

- [Epic 1: Authentication & Repository Connection](./epic-1.md)
  - [Story 1.1: Scaffold the Platform Monorepo and CI Pipeline](./epic-1.md#story-11-scaffold-the-platform-monorepo-and-ci-pipeline)
  - [Story 1.2: Sign In with GitHub](./epic-1.md#story-12-sign-in-with-github)
  - [Story 1.3: Connect a Repository by URL](./epic-1.md#story-13-connect-a-repository-by-url)
  - [Story 1.4: Validate BMAD Initialization in the Connected Repository](./epic-1.md#story-14-validate-bmad-initialization-in-the-connected-repository)
  - [Story 1.5: Resolve Git Identity for Commit Attribution](./epic-1.md#story-15-resolve-git-identity-for-commit-attribution)
  - [Story 1.6: Detect and Recover from Credential Failures](./epic-1.md#story-16-detect-and-recover-from-credential-failures)
  - [Story 1.7: Enforce Authenticated, Full Access for All MVP Users](./epic-1.md#story-17-enforce-authenticated-full-access-for-all-mvp-users)
  - [Story 1.8: Build the Persistent App Shell](./epic-1.md#story-18-build-the-persistent-app-shell)
  - [Story 1.9: Document and Validate the KEK Rotation Runbook](./epic-1.md#story-19-document-and-validate-the-kek-rotation-runbook)
- [Epic 2: Project Map & Artifact Browser](./epic-2.md)
  - [Story 2.1: Mirror Repository Artifacts into Postgres](./epic-2.md#story-21-mirror-repository-artifacts-into-postgres)
  - [Story 2.2: View the Project Map](./epic-2.md#story-22-view-the-project-map)
  - [Story 2.3: Manually Refresh the Project Map](./epic-2.md#story-23-manually-refresh-the-project-map)
  - [Story 2.4: Browse and Read All Committed Artifacts](./epic-2.md#story-24-browse-and-read-all-committed-artifacts)
  - [Story 2.5: View a Single Artifact's Rendered Content](./epic-2.md#story-25-view-a-single-artifacts-rendered-content)
  - [Story 2.6: Navigate from the Project Map to an Artifact](./epic-2.md#story-26-navigate-from-the-project-map-to-an-artifact)
- [Epic 3: Conversations — Running BMAD Skills with the Agent](./epic-3.md)
  - [Story 3.1: Provision a Sandbox When Opening a Conversation](./epic-3.md#story-31-provision-a-sandbox-when-opening-a-conversation)
  - [Story 3.2: Invoke BMAD Skills via Slash Command](./epic-3.md#story-32-invoke-bmad-skills-via-slash-command)
  - [Story 3.3: Converse with the Streaming Agent](./epic-3.md#story-33-converse-with-the-streaming-agent)
  - [Story 3.4: See Tool Calls and Recognized Actions Inline](./epic-3.md#story-34-see-tool-calls-and-recognized-actions-inline)
  - [Story 3.5: Resume an Existing Conversation](./epic-3.md#story-35-resume-an-existing-conversation)
  - [Story 3.6: Track and Manually Save Working Tree State](./epic-3.md#story-36-track-and-manually-save-working-tree-state)
  - [Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation](./epic-3.md#story-37-receive-real-time-credential-failure-alerts-mid-conversation)
  - [Story 3.8: Track Per-User LLM Spend](./epic-3.md#story-38-track-per-user-llm-spend)
  - [Story 3.9: Terminate Idle Sandboxes Mid-Conversation](./epic-3.md#story-39-terminate-idle-sandboxes-mid-conversation)
  - [Story 3.10: Verify Commits Carry the User's Own Identity](./epic-3.md#story-310-verify-commits-carry-the-users-own-identity)
  - [Story 3.11: Run Concurrent Conversations](./epic-3.md#story-311-run-concurrent-conversations)
  - [Story 3.12: Drain Conversations Gracefully on Deploy](./epic-3.md#story-312-drain-conversations-gracefully-on-deploy)
- [Epic 4: MVP Cloud Deployment Provisioning](./epic-4.md)
  - [Story 4.1: Provision the Vercel Project for apps/web](./epic-4.md#story-41-provision-the-vercel-project-for)
  - [Story 4.2: Provision the Railway Project with Postgres for apps/agent-be](./epic-4.md#story-42-provision-the-railway-project-with-postgres-for)
  - [Story 4.3: Add a Dockerfile for apps/agent-be](./epic-4.md#story-43-add-a-dockerfile-for)
  - [Story 4.4: Run Prisma Migrations Against the Railway Postgres Instance](./epic-4.md#story-44-run-prisma-migrations-against-the-railway-postgres-instance)
  - [Story 4.5: Wire Environment Variables and Secrets on Both Platforms](./epic-4.md#story-45-wire-environment-variables-and-secrets-on-both-platforms)
  - [Story 4.6: Add the Manual-Trigger Deploy Step to CI](./epic-4.md#story-46-add-the-manual-trigger-deploy-step-to-ci)
  - [Story 4.7: Confirm HTTP/2-Capable Reverse Proxy in Front of apps/agent-be](./epic-4.md#story-47-confirm-http2-capable-reverse-proxy-in-front-of)
  - [Story 4.8: Deploy Failure Recovery and Rollback](./epic-4.md#story-48-deploy-failure-recovery-and-rollback)
  - [Story 4.9: Configure Custom Domain and Stable Production URL](./epic-4.md#story-49-configure-custom-domain-and-stable-production-url)
  - [Story 4.10: Configure Database Backups and Verify Restore](./epic-4.md#story-410-configure-database-backups-and-verify-restore)
  - [Story 4.11: Configure Launch-Window Monitoring and Alerting](./epic-4.md#story-411-configure-launch-window-monitoring-and-alerting)
  - [Story 4.12: Secret Rotation Reminder Mechanism](./epic-4.md#story-412-secret-rotation-reminder-mechanism)
- [Epic 5: UX Mockup Fidelity — Close Visual Drift](./epic-5.md)
  - [Story 5.1: Restore Missing Visual Containers Across Surfaces](./epic-5.md#story-51-restore-missing-visual-containers-across-surfaces)
  - [Story 5.2: Fix Shared Shell and Page-Header Structural Drift](./epic-5.md#story-52-fix-shared-shell-and-page-header-structural-drift)
  - [Story 5.3: Fix Conversation Stream Structural Drift](./epic-5.md#story-53-fix-conversation-stream-structural-drift)
  - [Story 5.4: Fix Token-Usage Drift and Token-Config Gaps](./epic-5.md#story-54-fix-token-usage-drift-and-token-config-gaps)
  - [Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream](./epic-5.md#story-55-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream)
- [Epic 6: Sandbox-Based Agent Execution](./epic-6.md)
  - [Story 6.1: Install sandbox-agent + Claude Code Binaries in Sandbox During Provision](./epic-6.md#story-61-install-sandbox-agent-claude-code-binaries-in-sandbox-during-provision)
  - [Story 6.2: Implement agui-event-bridge.service.ts](./epic-6.md#story-62-implement-agui-event-bridgeservicets)
  - [Story 6.3: Migrate AgentService to Sandbox-Based Execution](./epic-6.md#story-63-migrate-agentservice-to-sandbox-based-execution)
  - [Story 6.4: Verify Working Tree, Commit, and Credential Flows](./epic-6.md#story-64-verify-working-tree-commit-and-credential-flows)
  - [Story 6.5: Real-Service E2E Verification](./epic-6.md#story-65-real-service-e2e-verification)
- [Epic 7: Live-Usage UX Improvements](./epic-7.md)
  - [Story 7.1: Unify Error State Presentation in Conversation View](./epic-7.md#story-71-unify-error-state-presentation-in-conversation-view)
  - [Story 7.2: Loading State for Sidebar Page Navigation](./epic-7.md#story-72-loading-state-for-sidebar-page-navigation)
  - [Story 7.3: Loading State for Artifact Switching in Artifact Browser](./epic-7.md#story-73-loading-state-for-artifact-switching-in-artifact-browser)
  - [Story 7.4: Reduce Focus State Prominence on Navigation Surfaces](./epic-7.md#story-74-reduce-focus-state-prominence-on-navigation-surfaces)
  - [Story 7.5: Relative Time for Conversation Timestamps](./epic-7.md#story-75-relative-time-for-conversation-timestamps)
  - [Story 7.6: Sign-out affordance (avatar dropdown)](./epic-7.md#story-76-sign-out-affordance-avatar-dropdown)
  - [Story 7.7: Repository disconnect from Settings](./epic-7.md#story-77-repository-disconnect-from-settings)
  - [Story 7.8: New conversation intro prompt](./epic-7.md#story-78-new-conversation-intro-prompt)
  - [Story 7.9: Side-nav conversation empty state](./epic-7.md#story-79-side-nav-conversation-empty-state)
  - [Story 7.10: Global 404 page](./epic-7.md#story-710-global-404-page)
  - [Story 7.11: Conversation delete](./epic-7.md#story-711-conversation-delete)
  - [Story 7.12: Conversation rename](./epic-7.md#story-712-conversation-rename)
  - [Story 7.13: Artifact Browser search and filter](./epic-7.md#story-713-artifact-browser-search-and-filter)
  - [Story 7.14: Conversation search / show all](./epic-7.md#story-714-conversation-search-show-all)
- [Epic 8: Sandbox Reconciliation via Environment-Scoped Labels](./epic-8.md)
  - [Story 8.1: Reconcile Orphaned Sandboxes via Environment-Scoped Labels](./epic-8.md#story-81-reconcile-orphaned-sandboxes-via-environment-scoped-labels)
