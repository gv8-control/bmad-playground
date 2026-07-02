---
title: "PRD: bmad-easy"
status: draft
created: 2026-06-14
updated: 2026-07-02
status: approved
approved_by: John (Product Manager)
approval_date: 2026-07-02
---

# PRD: bmad-easy

## 0. Document Purpose

This PRD is written for the founding PM, downstream workflow owners (architect, UX designer, engineering leads), and stakeholders evaluating scope and trade-offs before development begins. It covers the MVP of bmad-easy — a SaaS web platform that gives non-developer agile team members browser-based access to BMAD methodology skills within the context of their shared git repository.

Assumption tags (`[ASSUMPTION]`) mark inferred decisions and are indexed in §13. Related technical research, UX spec, and architecture document live in `_bmad-output/planning-artifacts/` and build on this PRD.

---

## 1. Vision

BMAD (Breakthrough Method for Agile AI-Driven Development) is built for the whole agile team. Its skill-by-skill structure — PRD creation, brainstorming, domain research, architecture review, sprint planning — is designed to be run by PMs, business analysts, delivery leads, and developers alike, producing shared artifacts in a single repository that the whole team works from. BMAD is implemented as a collection of Skills — pre-defined Claude Code prompt workflows stored in the team's Repository. The underlying runner is Claude Code; BMAD contributes the Skill definitions, not a separate agent.

In practice, only developers participate. BMAD runs through IDE extensions and command-line agent harnesses. Getting a PM or delivery lead to run a brainstorming session means configuring a local development environment, understanding git workflows, and operating tooling that was never built for them. The methodology's team-wide promise breaks at the access layer.

bmad-easy removes that barrier. Non-dev team members connect their git repository to the platform, open a Conversation with the Agent, run the same Skill workflows their developers run, and see the Artifact committed to the repository — without touching the terminal or git. The Project Map, a live view of the BMAD work the team has produced and what is in progress, is their home screen. The methodology is unchanged. The access layer is fixed.

The goal is a specific inversion: make BMAD feel like a tool that was built for PMs as much as it was built for developers. A team where the PM, BA, and delivery lead are full participants in BMAD produces richer artifacts, develops shared understanding across roles, and gets more out of the methodology than a team where developers run BMAD on behalf of non-dev colleagues.

---

## 2. Target User

### 2.1 Jobs To Be Done

**Primary users (seat holders):** Product Managers, Business Analysts, and Delivery Leads on agile software development teams that are using or adopting BMAD.

- Run BMAD Skills — brainstorming, PRD creation, domain research, sprint planning — without needing a developer to facilitate or translate
- Contribute Artifacts directly to the shared team Repository, on the same footing as developer-produced Artifacts
- See what BMAD work the team has done and what is in progress, without opening a git client or IDE
- Read Artifacts produced by teammates, including those produced by developers through local tooling
- Participate in the team's AI-driven workflow as a full contributor, not as a passenger who relies on someone else to operate the tool

**Decision maker / buyer:** Leader at a growth-stage company (1–200 people) with sufficient authority to purchase bulk subscriptions. Budget authority is the qualification criteria — titles vary. At companies in this size range, the buyer may carry a "Head of" or "Senior PM" title with VP-equivalent authority.

- Evaluate whether bmad-easy sufficiently extends the team's existing BMAD investment to non-dev participants
- Approve a per-seat purchase that does not require IT procurement or a pilot program
- Rely on the developer champion's internal evaluation to make the purchase decision

**Developer champion:** The developer who initialised BMAD in the Repository.

- Resolve the bottleneck of being the team's BMAD operator for non-dev colleagues
- Evaluate bmad-easy through a trial run and build an internal presentation for the purchase
- Bring the platform to the economic buyer's attention with evidence of team benefit

### 2.2 Non-Users (MVP)

- Developers who run BMAD through their local IDE or CLI — their workflow is unchanged by this platform
- Teams that have not yet initialised BMAD in their Repository — in MVP this platform does not set up BMAD; that remains a developer responsibility
- Teams using git providers other than GitHub — initial version is GitHub-only

### 2.3 Key User Journeys

**UJ-1. Sarah connects the team's repository and sees the Project Map for the first time.**

- **Persona + context:** Sarah is a PM at a 40-person SaaS company. Her team's developer has BMAD set up in the shared repo. The developer shared bmad-easy with her after growing tired of being the BMAD intermediary for every session.
- **Entry state:** Sarah has signed up for bmad-easy and is on the onboarding screen. No repository connected yet.
- **Path:** Sarah pastes the GitHub repository URL. The platform uses her GitHub OAuth access token (authorized with `repo` scope during sign-in) to validate write access to the Repository and confirms the repository has `_bmad` initialized. She is taken to the Project Map.
- **Climax:** The Project Map loads, showing the team's existing BMAD Artifacts — a brainstorming session the developer ran two weeks ago, a draft brief that was never finished. Sarah sees the team's BMAD state at a glance without opening GitHub.
- **Resolution:** Sarah is on the Project Map with the option to start a new Conversation or explore Artifacts.
- **Edge case:** If `_bmad` is not found in the Repository, Sarah sees a clear message naming the prerequisite and linking to BMAD documentation. She cannot proceed until a developer initialises BMAD in the repo.

**UJ-2. Sarah runs a PRD skill in a Conversation and the Agent commits the Artifact.**

- **Persona + context:** Sarah has connected her Repository and is on the Project Map. The team has an active brainstorming Artifact she wants to turn into a PRD.
- **Entry state:** Authenticated, Project Map visible, Repository connected.
- **Path:** Sarah opens a new Conversation from the Project Map. Within 10 seconds, the chat is ready. She types `/bmad-prd`, selects the Skill from the suggestion list, and starts conversing with the Agent, which takes on the PM persona defined by the `bmad-prd` Skill, providing context and responding to its questions across multiple turns over 20 minutes. When the Agent completes the PRD and commits it, "Progress saved" appears inline in the chat alongside a "View" link.
- **Climax:** Sarah clicks "View" and reads the rendered PRD in the Artifact Browser. The PRD commit shows her name as the author in git history.
- **Resolution:** Sarah is in the Artifact Browser with the committed PRD. The Project Map now shows the PRD as a completed Artifact.
- **Edge case:** If Sarah closes and returns to the Conversation later, she can resume from where she left off; the chat history and any committed Artifacts are available on the Project Map.

**UJ-3. Sarah reads a teammate's committed Artifact without starting a session.**

- **Persona + context:** Sarah's developer teammate committed an architecture document through their local Claude Code setup. Sarah wants to read it before a planning meeting.
- **Entry state:** Authenticated, Project Map visible.
- **Path:** Sarah sees the architecture document listed on the Project Map as a completed Artifact. She clicks it. The Artifact Browser opens the document as rendered Markdown.
- **Climax:** Sarah reads the architecture document in a clean, readable format — no GitHub interface, no file navigation.
- **Resolution:** Sarah has the context she needs for the planning meeting without opening GitHub.

---

## 3. Glossary

Terms used verbatim throughout this PRD. No synonyms are used elsewhere in the document.

- **BMAD** — Breakthrough Method for Agile AI-Driven Development; the AI workflow methodology the platform is built around. BMAD is implemented as a collection of Skills that run on the Claude Code agent harness; it does not provide a separate agent.
- **Skill** — a pre-defined Claude Code prompt workflow stored in the Repository's `.claude/skills/` directory; invoked via slash command within a Conversation. BMAD ships a curated set of Skills (e.g., `bmad-prd`, `bmad-brainstorming`, `bmad-create-architecture`); teams may also add custom Skills alongside them. The Agent executes all Skills the same way regardless of origin.
- **Conversation** — a persistent chat session between a user and the Agent.
- **Agent** — the Claude Code process running inside a Sandbox, executing Skills on behalf of the user. The Agent is not BMAD-specific; BMAD Skills and custom Skills are treated identically by it.
- **Artifact** — BMAD concept - a structured output (Markdown file) produced in a Conversation and committed to the Repository under `_bmad-output/`. Artifacts produced through the platform are identical in format to those produced by developers through local tooling.
- **Project Map** — the platform's home screen; a live view of the project's BMAD state derived from the Repository's `_bmad-output/` directory, showing in-progress and completed Artifacts.
- **Artifact Browser** — the read-only surface for viewing a committed Artifact, rendered as Markdown.
- **Repository** — the GitHub git repository containing the team's `_bmad/` setup and `_bmad-output/` Artifacts. The Repository is the sole source of truth for project state; the platform owns no copy of Repository content.
- **Sandbox** — an isolated cloud execution environment (Daytona Cloud) for running an AI Agent. The Agent and all tool calls run inside the Sandbox. Sandbox lifecycle is managed transparently by the platform; users are not exposed to it.
- **Tool Call** — a request made by the Agent to execute an operation: run a command, read a file, make a git commit, etc. Tool calls are a standard concept in Claude Code and AI agent systems generally. Every tool call the Agent makes during a Conversation is visible in the chat stream.
- **Tool Pill** — the inline visual element shown in the Conversation chat stream for each agent tool call, at the point in the stream where the action occurred. Every tool call produces a Tool Pill.
- **Semantic Pill** — a Tool Pill for which the platform has recognized semantic meaning and surfaced a human-readable label in place of the raw tool call. Example: a `git commit` by the Agent becomes "Progress saved", with a "View" link to the committed Artifact. Not all Tool Pills are Semantic Pills; only recognized actions are promoted.
- **Seat** — a licensed user slot in the platform's per-seat subscription.
- **OAuth access token** — the GitHub OAuth access token obtained when the user signs in with GitHub and authorizes the platform with `repo` scope. Used by the platform as both the platform authentication credential and the git transport credential for Repository operations. Grants access to all GitHub repositories the authorized user can access.
- **Runner** — the agent harness that executes Skills. Hardcoded to Claude Code for MVP; not user-configurable.

---

## 4. Features

### 4.1 Repository Connection & Onboarding

**Description:** The first action a new user takes is connecting a GitHub Repository. The user provides the repository URL; the platform validates access and BMAD setup using the GitHub OAuth access token authorized with `repo` scope during sign-in, then brings the user to the Project Map. Every subsequent git operation — reads for the Project Map and Artifact Browser, writes from Conversations — flows through this authenticated connection. Commit authorship is attributed to the individual user, not to a shared platform identity.

The `repo` scope grants access to all GitHub repositories the user can access, which is broader than required for a single connected Repository; this is an accepted trade-off of the OAuth App model for MVP. GitHub organizations with OAuth App access restrictions enabled may block write access even with `repo` scope granted (see §8 for the full constraint and post-MVP escalation path). Realizes UJ-1.

**Functional Requirements:**

#### FR-1: Repository Connection via URL

User can connect a GitHub Repository by providing its URL. The platform uses the user's GitHub OAuth access token (authorized with `repo` scope at sign-in) to validate and establish the connection.

**Consequences (testable):**

- Platform provides a URL input field. No token entry field is shown; the platform uses the OAuth access token already obtained during sign-in.
- Platform validates that the OAuth access token grants write access to the specified Repository before completing setup.
- On validation failure, the user sees a descriptive error indicating whether the token lacks the required permission or does not have access to the specified Repository. If the Repository belongs to a GitHub organization with OAuth App access restrictions enabled, the error message identifies the organization approval requirement.
- On success, the OAuth access token is stored encrypted at rest; it is never returned to the client after initial submission.
- User is redirected to the Project Map on successful connection.

**Out of Scope:** Connecting multiple repositories per account (post-MVP); GitHub App installation flow for per-repository scoping and short-lived tokens (post-MVP).

#### FR-2: BMAD Initialization Validation

Platform validates that the connected Repository contains `_bmad/`, `_bmad-output/`, `.claude/` before activating the connection, and that the BMAD installation is version 6.x. MVP supports BMAD v6 only; post-MVP version compatibility is undefined, pending domain and technical research.

**Consequences (testable):**

- If any required directory is absent, the user sees a blocking message naming the prerequisite and linking to BMAD documentation.
- Conversations are unavailable for Repositories without required directories.
- An empty `_bmad-output/` is acceptable; absence of prior Artifacts is not an error.
- The platform reads the BMAD version from the Repository's BMAD configuration. If the detected version is outside the v6.x range, the user sees a blocking message stating that only BMAD v6 is supported, naming the detected version, and linking to BMAD documentation. Conversations are unavailable until a supported BMAD version is present.
- If `.claude/skills/` is absent or contains no Skill files, the user sees a blocking message stating that no Skills were found; Conversations are unavailable until at least one Skill is present.

#### FR-3: Commit Attribution per User

Commits produced through Conversations are attributed to the individual user's identity, not to a shared platform credential.

**Consequences (testable):**

- Commits produced in a user's session are attributed to the user's GitHub OAuth identity (name and primary email as returned by the GitHub OAuth profile claim). These are injected into the Sandbox git config at session initialization. No user configuration is required or exposed. If the GitHub OAuth profile returns no primary email, the platform uses the GitHub-generated noreply address (`{github_username}@users.noreply.github.com`) as the fallback commit email.
- The OAuth access token is used for HTTPS transport only; it does not appear in the git commit record.
- Commits from two different users on the same Repository show distinct author identities in git history.

#### FR-4: Credential Health Monitoring

Platform monitors stored Repository credentials and surfaces a re-auth prompt when credentials are expired or revoked.

**Consequences (testable):**

- Any git operation returning HTTP 401 updates the stored credential health status to `failed` within one operation cycle. A 403 is classified (rate limit, org restriction, or permission denial) and does not mark the credential as failed — the token is valid but access is denied.
- The Project Map displays a re-auth notification when credential health status is `failed`.
- The notification provides a flow to re-authorize GitHub OAuth without disconnecting the Repository.
- Background operations that fail due to credential failure do not silently drop errors; the credential health status is updated before the next user-visible page load.

#### FR-5: Repository State on Page Load

Platform reads current `_bmad-output/` state from the Repository on page load and on manual refresh.

**Consequences (testable):**

- Project Map contents reflect the latest committed state of the Repository at the time of the most recent page load or manual refresh.
- A manual refresh control is visible on the Project Map.
- No real-time push detection in MVP; Repository state does not update automatically while the page is open.

---

### 4.2 Project Map

**Description:** The Project Map is the platform's home screen and central metaphor — the surface that makes BMAD's skill-by-skill execution feel like a coherent, living project. It shows what BMAD work the team has produced (completed Artifacts) and what is in progress (open Conversations on the platform), drawn directly from the Repository's `_bmad-output/` directory. No state lives in the platform; everything the Project Map shows is derived from git or from active platform session state. This is the MVP form of the Project Map — a structured Artifact list, not a visual workflow graph. Realizes UJ-3.

**Functional Requirements:**

#### FR-6: Project Map Artifact List

Authenticated user with a connected Repository sees the Project Map as their home screen: a list of Artifacts from `_bmad-output/`, organized by artifact type and status.

**Consequences (testable):**

- Artifacts are listed with: artifact type (e.g., brainstorming, PRD, brief), title derived from file frontmatter or path, and status (completed / in-progress).
- In-progress Artifacts associated with an active Conversation open as a page on this platform are visually distinguished from completed Artifacts.
- Artifacts produced by developers through local tooling appear alongside platform-produced Artifacts; the source of production is not distinguished.
- Empty state (no `_bmad-output/` content) shows a prompt to start the first Conversation.

**Out of Scope:** Visual workflow map, workflow node graph, artifact dependency graph, artifact health indicators (post-MVP).

#### FR-7: Manual Refresh

User can manually refresh the Project Map to reflect recently committed Artifacts.

**Consequences (testable):**

- Refresh re-reads `_bmad-output/` from the Repository.
- Refresh does not interrupt active Conversations.
- A refresh indicator is visible during the read operation.

#### FR-8: Navigation from Project Map

Clicking a completed Artifact on the Project Map opens it in the Artifact Browser. Clicking an in-progress Artifact with an open Conversation page brings that page into focus.

**Consequences (testable):**

- Click on a completed Artifact navigates to the Artifact Browser with that Artifact loaded.
- Click on an in-progress Artifact whose Conversation is active navigates to that Conversation's page.
- Click on an in-progress Artifact whose Conversation page is not open opens the Artifact in read-only Artifact Browser.

---

### 4.3 Conversations

**Description:** A Conversation is a persistent chat session with the Agent, backed by a dedicated Sandbox. The user opens a Conversation from the Project Map; Skills are available via slash command within the chat, the same as in Claude Code — the user can invoke multiple Skills across the course of a Conversation and is not bound to one Skill per session. The interaction is otherwise identical to what a developer has with their local agent harness: the same Skills, the same Artifact output, without any terminal or IDE involvement.

The platform monitors Agent tool calls and recognizes semantically significant actions, surfacing them inline in the chat with human-readable labels alongside non-recognized tool calls. Multiple Conversations can run concurrently, each at its own stable URL.

The Sandbox is provisioned when the Conversation page is opened (not when the first message is sent), so the git clone phase runs in the background while the user reads the chat interface. The chat is ready within seconds of the page opening. Realizes UJ-2.

**Functional Requirements:**

#### FR-9: Conversation Initiation

User can open a new Conversation from the Project Map.

**Consequences (testable):**

- Available Skills are derived from the connected Repository's `.claude/skills/` directory and are presented as slash-command suggestions within the chat, the same as in Claude Code.
- A new Conversation is opened from the Project Map via a "New Conversation" action, or from the New Conversation button in the persistent side navigation. Typing `/` within the chat displays a filterable list of available Skills. Selecting a Skill from the list invokes it within the current Conversation.
- The New Conversation page opens with a prompt in the chat area suggesting the user press `/` to browse available Skills. No Skill selection is required before sending a message.
- A New Conversation page has no permanent URL until the user sends the first message. On send, the page transitions to a permanent Conversation URL and the Conversation appears in the persistent side navigation.
- A Sandbox is provisioned and the Repository is cloned inside it as a background operation when the Conversation page opens; the chat interface is visible immediately.
- While the Sandbox is provisioning, a spinner and status label ("Starting session…") are displayed in the chat area. The chat input is disabled until the Sandbox is ready.
- Chat is ready for user input within 10 seconds of page open (satisfies NFR-P2).
- Opening a new Conversation is blocked with a clear upgrade prompt for users who have exceeded their Seat allocation.

#### FR-10: Streaming Chat Interface

User converses with the Agent in a chat interface; agent responses stream token-by-token with Markdown rendering.

**Consequences (testable):**

- Agent responses stream progressively; the user sees tokens as they are produced.
- Markdown formatting (headings, lists, code blocks, bold, italic, tables) is rendered in agent responses.
- A thinking indicator is displayed while the Agent is processing a response. A tool execution indicator is displayed while the Agent is executing a tool or Bash command inside the Sandbox, distinct from the thinking indicator shown during LLM response generation.
- First streamed token appears within 1,500 ms of the user sending a message (satisfies NFR-P1).
- Chat input is a multi-line auto-growing textarea that expands vertically as the user types. No rich-text toolbar, no file attachment input.
- Pressing Enter submits the message. Pressing Shift+Enter inserts a newline without submitting. A Send button is present as a secondary affordance.
- A **Stop** button is visible while the Agent is processing a response or executing a tool or Bash command. Activating Stop terminates the in-flight LLM response and any tool or Bash process running inside the Sandbox; it does not terminate the Sandbox itself. After Stop, the user can send a new message in the same session.
- Each message has a copy-to-clipboard action, accessible on hover. Code blocks within agent responses display an independent per-block copy button.
- A scroll-to-bottom button appears when the user has scrolled above the most recent message. The chat auto-scrolls to the bottom while streaming unless the user has manually scrolled up. The scroll-to-bottom button is hidden when the chat is already at the bottom.
- Each message displays a timestamp. Messages sent within the most recent minute show a relative label (e.g. "just now"); older messages show the wall-clock time. Timestamps on user messages are visible on hover; timestamps on agent messages are shown inline at reduced prominence.
- The user's unsent draft message is persisted such that refreshing any Conversation page — including an existing Conversation — restores the draft. The draft is cleared on successful send and will not be pre-loaded again.

#### FR-11: Concurrent Conversations

User can have multiple Conversations active concurrently, each accessible at its own stable URL.

**Consequences (testable):**

- Each Conversation maintains an independent Sandbox and independent chat history.
- Each Conversation is assigned a 2–5 word semantic title derived from its content. The semantic title is used as the Conversation's page title and as its label in the persistent side navigation.
- A per-user maximum of 10 concurrent active Conversations is enforced at the platform level.
- Attempting to open a new Conversation beyond the limit shows a "session limit reached" message rather than silently failing.

#### FR-12: Tool Call Visibility and Semantic Recognition

The platform surfaces all agent tool calls as Tool Pills inline in the chat stream at the point where each action occurs. Recognized tool calls are additionally promoted to Semantic Pills, replacing the raw tool call with a human-readable label.

**Consequences (testable):**

- Every agent tool call produces a Tool Pill in the chat stream at the position where the action occurred.
- A `git commit` by the Agent is a recognized action; its Tool Pill is promoted to a Semantic Pill displayed as "Progress saved" with the Artifact type, title, and a "View" link. The "Progress saved" Semantic Pill is emitted only after confirmed commit success — it is not emitted on commit initiation. A failed `git commit` produces an error-state Tool Pill (not a "Progress saved" Semantic Pill); FR-14's working tree state indicator remains dirty.
- Clicking "View" opens the committed Artifact in the Artifact Browser.
- Semantic Pills are part of the chat stream, not a separate notification channel.
- Multiple recognized actions in a single Conversation each produce a distinct Semantic Pill at the position where they occurred.
- For MVP, `git commit` is the only action that receives Semantic Pill promotion; all other tool calls remain as standard Tool Pills. Additional recognized actions are post-MVP.
- When any agent tool call fails, the failure appears in the chat stream as an error-state Tool Pill at the position where it occurred. The error description from the agent is displayed within the Tool Pill. No automatic retry is attempted.

#### FR-13: Conversation Persistence

A Conversation is always resumable. The platform manages any underlying session re-initialization transparently.

**Consequences (testable):**

- Navigating to a Conversation restores its full chat history.
- If the underlying infrastructure requires re-initialization, the platform handles it transparently; the user sees a loading indicator and can continue once ready.

#### FR-14: Working Tree State Indicator

Platform displays a persistent status indicator in the chat input area showing whether the Agent's in-progress work (under the hood: git working tree) has been committed to the Repository.

**Consequences (testable):**

- A status indicator is displayed in the chat input area. It shows `● Unsaved changes` (amber) when the working tree has uncommitted changes, and `✓ All saved` (muted) or is hidden when the working tree is clean.
- The indicator updates after each agent action or manual save (FR-15)

#### FR-15: Manual Commit

User can commit the current working tree state of a Conversation on demand via the Save control in the chat input area. This allows users to preserve in-progress work in the Repository at a point of their choosing.

**Consequences (testable):**

- The status indicator from FR-14 is activatable (clickable) when the working tree has uncommitted changes. Activating it presents a confirmation labeled "Save" — no git vocabulary is shown to the user.
- Confirming executes a platform-level commit inside the Sandbox, bypassing the Agent.
- The save operation does not execute while an agent turn is in progress. The user receives immediate visual acknowledgment and the save fires when the agent is next idle.
- The platform-initiated commit uses the message format `chore(platform-save): checkpoint [<ISO8601 UTC timestamp>]`. This message is not shown in the chat UI; it is visible only in git history.
- On success: a Semantic Pill indicating the manual save appears inline in the chat at the position of the save event, and the indicator resets to clean state.
- On failure: the save error is displayed in the chat area as an error-state Tool Pill at the position of the save event, using the same visual presentation as a failed agent tool call (FR-12); the indicator remains dirty; no partial commit state is created.
- The Save control is disabled while a save operation is in progress, preventing duplicate submissions.
- If the working tree is clean when the save is triggered, the operation returns a no-op without error.

**Out of Scope:** User-authored commit messages (post-MVP); per-file selection of what to include in a manual commit (post-MVP).

---

### 4.4 Artifact Browser

**Description:** The Artifact Browser provides a clean read-only view of any committed Artifact from the Repository. Its job is to make BMAD output readable to non-dev team members without GitHub's file-navigation interface. It is accessed from the Project Map and from Semantic Pills in the Conversation chat; it has no stand-alone navigation and no editing capability. Realizes UJ-2 (resolution), UJ-3.

**Functional Requirements:**

#### FR-16: Artifact Rendering

User can view any committed Artifact from `_bmad-output/` as rendered Markdown.

**Consequences (testable):**

- The Artifact Browser is a single page with two layout states. When accessed directly (e.g., from the side navigation), it shows a full-width flat list of all Artifacts from `_bmad-output/`. When an Artifact is selected — by clicking in the list, or by arriving from a Project Map click or a Semantic Pill "View" link — the list narrows and the rendered Artifact is displayed alongside it. Artifacts are listed in reverse commit-date order (most recently committed first) by default; the UX spec may override this ordering.
- Artifact content is read directly from the Repository at its latest committed revision.
- Content is rendered with standard Markdown formatting (headings, lists, tables, code blocks, bold, italic).
- The Artifact Browser is read-only; no editing controls are present.
- A committed Artifact loads within 2 seconds (satisfies NFR-P4).

#### FR-17: Artifact Access Points

Artifact Browser is accessible from the Project Map and from Semantic Pills in Conversation chat.

**Consequences (testable):**

- Both entry points resolve to the same rendered view of the Artifact at its latest committed state.
- "Back" navigation from the Artifact Browser returns the user to their entry point (Project Map or Conversation page).

---

### 4.5 Authentication & Access Control

**Description:** Users authenticate with the platform via GitHub OAuth. All platform access — Project Map, Artifact Browser, and Conversations — requires an authenticated account. In MVP, all users are automatically enrolled in a full-access plan with no expiry on sign-up; billing is not enforced in MVP. Repository access permissions are governed by the user's GitHub account permissions, inherited through the OAuth access token authorized with `repo` scope at sign-in; no separate platform access control layer exists in MVP.

**Functional Requirements:**

#### FR-18: Platform Authentication

User authenticates with the platform using GitHub OAuth.

**Consequences (testable):**

- GitHub OAuth is the only authentication path at the sign-up and sign-in screen.
- Session persists across browser refreshes until explicit logout or session expiry. Session lifetime is not configured by the platform for MVP; it uses the authentication provider's framework default, which should meet a minimum of 8 hours to allow within-day return to in-progress Conversations.

#### FR-19: Access Control

All platform access requires an authenticated account. In MVP, all users are automatically enrolled in a full-access plan with no expiry on sign-up; no paywall, trial expiry, or billing enforcement exists in MVP.

**Consequences (testable):**

- An unauthenticated request to any platform page redirects to the sign-in screen.
- All authenticated MVP users have unrestricted access to all platform features (Project Map, Artifact Browser, Conversations).
- Concurrent session limits defined in FR-11 are enforced regardless of access status.

---

## 5. Non-Goals (Explicit)

- **BMAD initialization.** The platform does not set up `_bmad` in Repositories. That remains a developer responsibility and a prerequisite for any use of the platform.
- **Terminal or IDE access.** The platform is not a general-purpose code environment or a hosted IDE.
- **Branching and pull request workflows.** All git writes go to the main branch in MVP. Branch-based proposal and review workflows are post-MVP.
- **Real-time collaborative Conversations.** Multiple users cannot cooperate inside a single Conversation simultaneously in MVP.
- **Proactive workflow nudging.** The platform does not prompt the user to run the next Skill or push a workflow agenda. It executes the Skill the user selects.
- **PM tool integrations.** No Jira, Confluence, Linear, or equivalent in MVP. Artifacts live in the Repository.
- **Self-hosted or on-premise deployment.** SaaS only in MVP.
- **Non-GitHub git providers.** GitLab, Bitbucket, Azure DevOps, and others are out of scope for MVP.
- **User-selectable LLM model.** The model used by the Agent is hardcoded for MVP.
- **Artifact editing.** Users cannot edit committed Artifacts through the Artifact Browser.
- **Uptime SLA.** No uptime target or availability SLA is defined for MVP.

---

## 6. MVP Scope

### 6.1 In Scope

- GitHub OAuth platform authentication
- Repository connection via URL, using the user's GitHub OAuth access token (authorized with `repo` scope at sign-in); access token stored AES-256-GCM encrypted
- Repository BMAD validation (`_bmad/` presence check) with a clear error path if absent
- Project Map: Artifact list from `_bmad-output/`, in-progress / completed status, manual refresh
- Conversations: streaming chat interface, Skills from the connected Repository (BMAD-provided and custom), slash-command Skill invocation within Conversations, Tool Pills for all agent tool calls with Semantic Pills for recognized actions, concurrent Conversations
- Artifact Browser: read-only rendered Markdown view of committed Artifacts
- Commit attribution per user (git author/committer identity injected per session)
- Working tree state indicator and manual save in the chat input area (FR-14, FR-15)
- Credential health monitoring with re-auth prompt on 401
- SaaS deployment; per-seat subscription (billing enforcement post-MVP; all MVP users auto-enrolled with no expiry)
- Single Runner (Claude Code); LLM model hardcoded

### 6.2 Out of Scope for MVP

- GitHub App integration, which replaces the broad OAuth `repo` scope with per-repository fine-grained permissions and short-lived installation tokens (post-MVP)
- Non-GitHub git providers (post-MVP)
- Branching / pull request workflows (post-MVP enterprise feature)
- Real-time Repository push detection / webhooks (Repository state refreshes on page load and manual refresh only)
- Proactive Skill suggestions or workflow nudging (requires PM tool integrations; out of scope)
- PM tool integrations (Jira, Confluence, Linear — post-MVP)
- Self-hosted deployment
- User-selectable LLM model (post-MVP)
- Agent tool call failure retry logic — tool call errors are surfaced to the user via Tool Pills (FR-12); automatic retry is post-MVP
- Conflict detection and resolution for concurrent writes to the same Artifact path — two concurrent Conversations committing to the same path result in last-write-wins with no user warning (post-MVP)
- In-app async completion badge when switching pages during a long session (post-MVP)
- Role-based access controls beyond Seat / no-Seat (post-MVP)
- Observability dashboards and per-user token usage reporting visible to administrators (post-MVP; internal spend monitoring is in scope from day one)
- Multi-repository connections per account (post-MVP)

---

## 7. Cross-Cutting NFRs

### Security

- **NFR-S1 (Sandbox credential and network isolation):** Platform-internal credentials (database connection strings, internal service API keys, platform service account tokens) must not be injected into a Sandbox environment. The user's OAuth access token is explicitly permitted inside the Sandbox for git transport operations. The Sandbox network must not have accessible routes to the agent backend's internal service endpoints.
- **NFR-S2 (Credential isolation):** Repository OAuth access tokens must never be resolved across users. Every git credential lookup must pass through a tenant authorization check at the service layer before a credential is resolved.
- **NFR-S3 (Active sandbox termination on deactivation):** When a user account is deactivated, all active Sandboxes for that user must be terminated immediately through the platform's sandbox management interface. Passive rejection of new session requests is insufficient.
- **NFR-S4 (OAuth token storage):** GitHub OAuth access tokens are encrypted when stored on the platform and never returned to the client after initial submission.

### Performance

Verified with a single manual test run under normal conditions, not statistical sampling.

- **NFR-P1:** First streamed token appears within 1,500 ms of the user sending a message.
- **NFR-P2:** Chat is ready for user input within 10 seconds of opening a Conversation page. This target applies to repositories under approximately 200 MB (see §12 Q-1 for the architecture owner's task to formally document this boundary).
- **NFR-P3:** Project Map loads within 2 seconds of page open.
- **NFR-P4:** Artifact Browser loads a committed Artifact within 2 seconds.
- **NFR-P5 (Manual commit latency):** A platform-initiated commit completes within 5 seconds of the save operation executing (exclusive of queue time waiting for an agent turn to complete).

### Reliability

- **NFR-R1 (Credential health):** Credential health status must update within one git operation cycle of a 401 response. Silent credential failures are not acceptable. A 403 is not a credential failure — it is classified into rate limit, org restriction, or permission denial without marking the credential as failed.
- **NFR-R2 (Session recovery from git):** Committed Artifacts are always recoverable from the Repository, independent of Sandbox state. In-progress working tree state that has not been committed is not guaranteed to survive a Sandbox restart; the manual save (FR-15) exists for users who want to capture it.
- **NFR-R3 (SSE back-pressure):** The streaming transport must not silently drop events when the client is slow to consume; it must apply back-pressure and pause token emission until the client is ready.
- **NFR-R4 (SSE connection capacity):** The streaming transport must support 10 concurrent agent SSE connections per browser session without connection starvation, matching the per-user Conversation limit defined in FR-11. Transport configuration that imposes a lower browser-level connection limit is not acceptable.

### Observability

- **NFR-O1 (Spend monitoring):** Platform must track per-user LLM spend via the Agent SDK's cost reporting from day one. Budget alerting for anomalous per-user spending must be operational at launch.

---

## 8. Constraints & Guardrails

**Platform.** Web application, accessed through any modern browser. No mobile native app, no PWA, no desktop client in MVP.

**Navigation model.** The platform uses page-based navigation. Project Map, Conversation, and Artifact Browser are distinct pages with stable URLs. In-page navigation is hierarchical with breadcrumbs one level deep: Project Map is the root; Conversation and Artifact Browser pages are one level down and display a breadcrumb back to the Project Map. No in-app tab UI is implemented.

A persistent side navigation panel is always visible after onboarding. It contains: the last 5 Conversations labeled with a 2–5 word semantic summary each, a New Conversation button, a separator, links to Project Map and Artifact Browser, and a user avatar circle displaying the user's initials as the entry point to Settings. Settings is present in MVP as an empty "coming soon" page. (Note for downstream authors: the persistent side navigation panel specification is located here in §8 rather than in §4 Features.)

**Sandbox isolation level.** Daytona Cloud provides medium isolation, which is acceptable for MVP given authenticated users directing agent work on their own Repositories. If evidence of adversarial use emerges, upgrading to stronger VM-level isolation is the documented escalation trigger; the platform is designed to contain that migration. [ASSUMPTION: A-2]

**Daytona Cloud as a critical dependency.** Agent Sandbox execution depends on Daytona Cloud's availability. Daytona OSS self-hosting (AGPL-3.0) is the documented continuity fallback; migration is contained to the `SandboxService` layer. [ASSUMPTION: A-7]

**Agent SDK credit billing.** Claude Agent SDK sessions draw from a separate monthly credit pool; API key authentication is required. OAuth via claude.ai is not permitted for third-party platforms (billing model as of June 15, 2026). Platform API costs are metered separately from any personal Claude subscriptions team members may hold. [ASSUMPTION: A-3]

**Main branch only.** All git writes go to the main branch. BMAD's design minimises direct write conflicts (Skills write to distinct Artifact paths); however, two concurrent sessions committing to the same path will result in last-write-wins. The platform makes no attempt to detect or surface clobber events; the Repository git history reflects the last-committed state; the earlier committing user receives no notification. This is a known constraint, not an error condition for MVP.

**Stateful platform backend.** A single container hosts the platform backend for MVP — no horizontal scaling, no shared session registry across containers. Horizontal scaling is a post-MVP architectural change.

**GitHub only.** Repository connection is GitHub-only in MVP. A provider abstraction will serve as the extension point when a second git provider is added post-MVP.

**BMAD version.** MVP supports BMAD v6.x only. The platform validates the BMAD version at Repository connection (FR-2). Post-MVP support for other BMAD versions is undefined, pending domain and technical research.

**GitHub organization OAuth App restrictions.** GitHub organizations can enable a policy that blocks OAuth App access to organization repositories unless the org owner has explicitly approved the OAuth App. If a user's connected Repository belongs to such an organization, the platform's `repo`-scoped OAuth token will not carry write access to that Repository regardless of the user's individual permissions. This is a platform-level constraint with no in-app workaround in MVP; the org owner must approve the bmad-easy OAuth App. GitHub App integration (post-MVP) sidesteps this restriction entirely. The business impact of this restriction on the target enterprise market will be evaluated post-launch; GitHub App integration is the escalation path if adoption data confirms material impact.

**LLM model.** The Agent runs `claude-sonnet-4-6` (hardcoded for MVP). Model selection is not exposed to users.

**EU Data Act (effective September 2025).** Data portability in machine-readable formats and mandatory switching rights must be designed into the product architecture from launch. These cannot be retrofitted.

**SOC 2.** SOC 2 Type II is a gating requirement for mid-market sales. Begin the certification process at approximately 6 months post-launch; estimated cost $30K–$80K.

---

## 9. Why Now

Market timing, competitive window, and moat analysis have been relocated to `strategy.md` (human-facing). Decision rationale: DL-10.

---

## 10. Monetization

Pricing, sales motion, and cost-floor analysis have been relocated to `strategy.md` (human-facing). MVP billing posture is captured in FR-19 (no billing enforcement) and A-5. Cost-floor deferral rationale: DL-11.

---

## 11. Success Metrics

**Primary**

- **SM-1: Unassisted session completion rate.** Percentage of new non-dev users who complete a full skill run in a Conversation (through to a committed Artifact) without assistance. Target: ≥ 60% in the first 30 days post-signup. Validates FR-9, FR-10, FR-12, and UJ-2.
- **SM-2: Session repeat rate.** Percentage of non-dev users who complete a second skill run within 14 days of their first. Target: ≥ 40%. Validates that the product is an invitation, not a one-time exercise. Validates FR-13.

**Secondary**

- **SM-3: Team activation rate.** Percentage of paying accounts in which at least 3 skill runs are completed by a non-dev user in the first 90 days. Target: ≥ 50%. Validates product-team fit.
- **SM-4: VP/Director buyer conversion.** At least one paying team includes a Director or VP-level buyer purchasing Seats at the full asking price within 6 months of launch. Validates the two-persona GTM model.
- **SM-5: Second-month retention.** Teams that pay for a second month run ≥ 4 skill runs that month. Validates the tool has become part of the team's working rhythm.

**Counter-metrics (do not optimize)**

- **SM-C1: Session duration.** Do not optimize for long sessions. Long sessions may indicate the Agent is struggling rather than being productive. Counterbalances SM-1.
- **SM-C2: Seat count over activation.** Do not optimize for seat growth if activated users are not completing skill runs. Empty seats are a vanity metric. Counterbalances SM-4.

**If this is not working**

If fewer than 2 teams reach 3 skill runs within 90 days of launch, the experience requires fundamental rethinking before any further effort to grow the user base.

---

## 12. Open Questions

**Q-1: Repository size limit and NFR-P2 scope**

NFR-P2 (chat ready within 10 seconds of page open) is not validated against large repositories for MVP. Daytona provisioning time for repositories above a few hundred MB may exceed this target, and large monorepos are not a supported configuration in MVP. The supported scope is standard-sized repositories (under ~200 MB). Large repository support — including shallow clone or sparse checkout — is a post-MVP concern. _Owner:_ Architect to formally document the size boundary in §8 constraints before the architecture document is finalized.

**Q-2: Daytona compute cost estimate**

Daytona sandbox compute cost per session has not been estimated and is excluded from the cost floor analysis in §10. Estimating it requires architecture decisions on Sandbox configuration, idle timeout, and cold-start optimization. _Owner:_ Architect to provide a Daytona compute cost estimate (including idle compute, cold-start overhead, and per-session cost at the SM-5 retention target of ≥ 4 sessions per team per month) before launch pricing is locked.

---

## 13. Assumptions Index

- **A-1:** The connected Repository has `_bmad/`, `_bmad-output/`, `.claude/` already initialized by a developer, running BMAD v6.x. bmad-easy does not set up BMAD and supports BMAD v6 only for MVP. (§4.1 FR-2, §5, §8)
- **A-2:** Daytona Cloud Docker-level isolation is acceptable for authenticated, non-adversarial users in MVP. Upgrade to Firecracker microVM isolation is the documented escalation trigger if adversarial use is detected. (§8)
- **A-3:** Claude Agent SDK billing applies via API key and separate credit pool as of June 15, 2026. OAuth via claude.ai is not permitted for third-party platforms. (§8)
- **A-4:** Maximum 10 concurrent Conversations per user. (§4.3 FR-11)
- **A-5:** All MVP users are automatically enrolled in a full-access plan with no expiry; no trial, paywall, or billing enforcement in MVP. Subscription billing is post-MVP. (§4.5 FR-19, §10)
- **A-6:** GitHub OAuth App with `repo` scope is the chosen approach for Repository git transport in MVP. The `repo` scope grants access to all GitHub repositories the user can access, broader than needed for a single connected Repository. GitHub organizations with OAuth App access restrictions enabled may block write access. GitHub App integration is the post-MVP path. (§4.1, §6.2, DL-7)
- **A-7:** Daytona Cloud is the MVP sandbox platform. Daytona OSS self-hosting is the documented continuity fallback; migration is bounded to the `SandboxService` layer. (§8)
