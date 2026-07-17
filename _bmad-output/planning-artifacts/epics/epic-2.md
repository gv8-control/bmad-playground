# Epic 2: Project Map & Artifact Browser

A user can see what BMAD work the team has produced and what is in progress (Project Map), and read any committed Artifact as clean, rendered Markdown (Artifact Browser) — without opening GitHub.

## Story 2.1: Mirror Repository Artifacts into Postgres

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

## Story 2.2: View the Project Map

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

## Story 2.3: Manually Refresh the Project Map

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

## Story 2.4: Browse and Read All Committed Artifacts

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

## Story 2.5: View a Single Artifact's Rendered Content

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

## Story 2.6: Navigate from the Project Map to an Artifact

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
