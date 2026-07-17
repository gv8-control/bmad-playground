# Epic 1: Authentication & Repository Connection

A new user can sign in with GitHub, connect their team's BMAD-enabled repository, and have it validated and ready for use — including the foundational platform scaffold (Nx workspace, Postgres/Prisma, boundary JWT, OAuth envelope encryption, CI/CD) that every later epic builds on.

## Story 1.1: Scaffold the Platform Monorepo and CI Pipeline

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

## Story 1.2: Sign In with GitHub

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

## Story 1.3: Connect a Repository by URL

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

## Story 1.4: Validate BMAD Initialization in the Connected Repository

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

## Story 1.5: Resolve Git Identity for Commit Attribution

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

## Story 1.6: Detect and Recover from Credential Failures

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

## Story 1.7: Enforce Authenticated, Full Access for All MVP Users

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

## Story 1.8: Build the Persistent App Shell

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

## Story 1.9: Document and Validate the KEK Rotation Runbook

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
