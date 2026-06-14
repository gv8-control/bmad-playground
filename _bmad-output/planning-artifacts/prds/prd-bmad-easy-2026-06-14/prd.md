---
title: "PRD: bmad-easy"
status: draft
created: 2026-06-14
updated: 2026-06-14
---

# PRD: bmad-easy

## 0. Document Purpose

This PRD is written for the founding PM, downstream workflow owners (architect, UX designer, engineering leads), and stakeholders evaluating scope and trade-offs before development begins. It covers the MVP of bmad-easy — a SaaS web platform that gives non-developer agile team members browser-based access to BMAD methodology skills within the context of their shared git repository.

The document is structured as: user definition and journeys (§2), a Glossary anchoring all vocabulary (§3), feature descriptions with globally numbered functional requirements (§4), non-goals (§5), MVP scope (§6), cross-cutting quality requirements (§7), constraints (§8), timing rationale (§9), monetization (§10), and success metrics (§11). Assumption tags (`[ASSUMPTION]`) are used inline where decisions are inferred; all are indexed in §13.

Technical research that informed architecture and platform choices — Daytona Cloud isolation, AG-UI protocol, Claude Agent SDK integration, git authentication — lives in `_bmad-output/planning-artifacts/research/`. The UX spec and architecture document, when produced, build on this PRD and do not need to reproduce its contents.

---

## 1. Vision

BMAD (Breakthrough Method for Agile AI-Driven Development) is built for the whole agile team. Its skill-by-skill structure — PRD creation, brainstorming, domain research, architecture review, sprint planning — is designed to be run by PMs, business analysts, delivery leads, and developers alike, producing shared artifacts in a single repository that the whole team works from.

In practice, only developers participate. BMAD runs through IDE extensions and command-line agent harnesses. Getting a PM or delivery lead to run a brainstorming session means configuring a local development environment, understanding git workflows, and operating tooling that was never built for them. The methodology's team-wide promise breaks at the access layer.

bmad-easy removes that barrier. Non-dev team members connect their shared repository by pasting a URL, open a chat session with the BMAD agent of their choice, run the same skill workflows their developers run, and see the Artifact committed to the shared repository — without touching a terminal or a git command. The Project Map, a live view of the BMAD work the team has produced and what is in progress, is their home screen. The methodology is unchanged. The access layer is fixed.

The goal is a specific inversion: make BMAD feel like a tool that was built for PMs as much as it was built for developers. A team where the PM, BA, and delivery lead are full participants in BMAD produces richer artifacts, develops shared understanding across roles, and gets more out of the methodology than a team where developers run BMAD on behalf of non-dev colleagues.

---

## 2. Target User

### 2.1 Jobs To Be Done

**Primary users (seat holders):** Product Managers, Business Analysts, and Delivery Leads on agile software development teams that are using or adopting BMAD.

- Run BMAD Skill Sessions — brainstorming, PRD creation, domain research, sprint planning — without needing a developer to facilitate or translate
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
- **Path:** Sarah pastes the GitHub repository URL. The platform displays a step-by-step in-product guide for generating a fine-grained GitHub PAT scoped to that repository with `contents:write` access. She generates the token, pastes it, and the platform validates the PAT and confirms the repository has `_bmad` initialized. She is taken to the Project Map.
- **Climax:** The Project Map loads, showing the team's existing BMAD Artifacts — a brainstorming session the developer ran two weeks ago, a draft brief that was never finished. Sarah sees the team's BMAD state at a glance without opening GitHub.
- **Resolution:** Sarah is on the Project Map with the option to start a new Skill Session or read an existing Artifact.
- **Edge case:** If `_bmad` is not found in the Repository, Sarah sees a clear message naming the prerequisite and linking to BMAD documentation. She cannot proceed until a developer initialises BMAD in the repo.

**UJ-2. Sarah runs a PRD Skill Session and sees the Commit Pill when the Artifact is committed.**

- **Persona + context:** Sarah has connected her Repository and is on the Project Map. The team has an active brainstorming Artifact she wants to turn into a PRD.
- **Entry state:** Authenticated, Project Map visible, Repository connected.
- **Path:** Sarah opens the Skill list and selects `bmad-prd`. A new tab opens next to the Project Map tab with a loading indicator while the session Sandbox is provisioned. Within 10 seconds, the chat is ready. Sarah starts conversing with the BMAD PM agent, providing context and responding to its questions across multiple turns over 20 minutes. When the agent completes the PRD and commits it, a Commit Pill appears inline in the chat: "PRD: bmad-easy — committed. View."
- **Climax:** Sarah clicks the Commit Pill and reads the rendered PRD in the Artifact Browser. The PRD commit shows her name as the author in git history.
- **Resolution:** Sarah is in the Artifact Browser with the committed PRD. The Project Map tab now shows the PRD as a completed Artifact.
- **Edge case:** If the session is idle for 30 minutes, the Sandbox pauses. Sarah returns to find the session expired; any committed work is preserved and visible on the Project Map.

**UJ-3. Sarah reads a teammate's committed Artifact without starting a session.**

- **Persona + context:** Sarah's developer teammate committed an architecture document through their local Claude Code setup. Sarah wants to read it before a planning meeting.
- **Entry state:** Authenticated, Project Map visible.
- **Path:** Sarah sees the architecture document listed on the Project Map as a completed Artifact. She clicks it. The Artifact Browser opens the document as rendered Markdown.
- **Climax:** Sarah reads the architecture document in a clean, readable format — no GitHub interface, no file navigation.
- **Resolution:** Sarah has the context she needs for the planning meeting without opening GitHub.

---

## 3. Glossary

Terms used verbatim throughout this PRD. No synonyms are used elsewhere in the document.

- **BMAD** — Breakthrough Method for Agile AI-Driven Development; the AI workflow methodology the platform is built around. Not defined or configured by this platform.
- **Skill** — a named BMAD workflow (e.g., `bmad-prd`, `bmad-brainstorming`, `bmad-create-architecture`); the unit of BMAD work a user runs in a Skill Session. Skill definitions live in `_bmad/skills/` in the Repository.
- **Skill Session** — a single chat conversation between a user and a BMAD Agent executing a specific Skill. Each Skill Session runs in its own Sandbox.
- **BMAD Agent** — the Claude Code process running inside a Sandbox, executing a BMAD Skill on behalf of the user.
- **Artifact** — a structured output (Markdown file) produced by a Skill Session and committed to the Repository under `_bmad-output/`. Artifacts produced through the platform are identical in format to those produced by developers through local tooling.
- **Project Map** — the platform's home screen; a live view of the project's BMAD state derived from the Repository's `_bmad-output/` directory, showing in-progress and completed Artifacts.
- **Artifact Browser** — the read-only surface for viewing a committed Artifact, rendered as Markdown.
- **Repository** — the GitHub git repository containing the team's `_bmad/` setup and `_bmad-output/` Artifacts. The Repository is the sole source of truth for project state; the platform owns no copy of Repository content.
- **Sandbox** — an isolated cloud execution environment (Daytona Cloud) provisioned per Skill Session. The BMAD Agent and all git operations run inside the Sandbox. Sandboxes are paused after user inactivity and destroyed after the session idle timeout.
- **Commit Pill** — an inline chat event indicator that appears in the Skill Session chat stream when the BMAD Agent commits an Artifact to the Repository.
- **Seat** — a licensed user slot in the platform's per-seat subscription. Required to initiate Skill Sessions.
- **PAT** — a fine-grained GitHub Personal Access Token, generated by the user and scoped to a single Repository with `contents:write` permission. Used by the platform as a git transport credential for MVP. Not used for platform authentication.
- **Runner** — the agent harness that executes BMAD Skills. Hardcoded to Claude Code for MVP; not user-configurable.

---

## 4. Features

### 4.1 Repository Connection & Onboarding

**Description:** The first action a new user takes is connecting a GitHub Repository. The platform guides the user through generating a fine-grained PAT scoped to that Repository, validates the PAT and the Repository's BMAD setup, and brings the user to the Project Map. Every subsequent git operation — reads for the Project Map and Artifact Browser, writes from Skill Sessions — flows through this authenticated connection. Commit authorship is attributed to the individual user, not to a shared platform identity.

This flow asks non-dev users to complete a step (PAT generation) that is routine for developers but unfamiliar to PMs and BAs. The in-product guide must be clear enough that a user who has never heard of a personal access token can complete onboarding without external help. This is a known activation friction point; GitHub App integration (post-MVP) removes it. Realizes UJ-1.

**Functional Requirements:**

#### FR-1: Repository Connection via URL and PAT

User can connect a GitHub Repository by pasting its URL and entering a fine-grained GitHub PAT.

**Consequences (testable):**

- Platform displays a step-by-step in-product guide for generating a fine-grained PAT scoped to the pasted Repository URL with `contents:write` permission.
- Platform validates that the PAT grants write access to the specified Repository before completing setup.
- On validation failure, the user sees a descriptive error indicating whether the PAT is invalid, lacks the required permission scope, or does not have access to the specified Repository.
- On success, the PAT is stored AES-256-GCM encrypted with KMS envelope encryption; it is never returned to the client after initial submission.
- User is redirected to the Project Map on successful connection.

**Out of Scope:** OAuth-based automatic git credential flow (post-MVP GitHub App); connecting multiple repositories per account (post-MVP).

#### FR-2: BMAD Initialization Validation

Platform validates that the connected Repository contains `_bmad/` before activating the connection.

**Consequences (testable):**

- If `_bmad/` is absent, user sees a blocking message naming the prerequisite and linking to BMAD documentation.
- Skill Session initiation is unavailable for Repositories without `_bmad/`.
- An empty `_bmad-output/` is acceptable; absence of prior Artifacts is not an error.

#### FR-3: Commit Attribution per User

Commits produced by Skill Sessions are attributed to the individual user's identity, not to a shared platform credential.

**Consequences (testable):**

- `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL` are set to the user's platform profile values for every commit made inside their Sandboxes.
- The PAT is used for HTTPS transport only; it does not appear in the git commit record.
- Commits from two different users on the same Repository show different author identities in git history.

#### FR-4: Credential Health Monitoring

Platform monitors stored Repository credentials and surfaces a re-auth prompt when credentials are expired or revoked.

**Consequences (testable):**

- Any git operation returning HTTP 401 or 403 updates the stored credential health status to `failed` within one operation cycle.
- The Project Map displays a re-auth notification when credential health status is `failed`.
- The notification provides a flow to replace the stored PAT without disconnecting the Repository.
- Background operations that fail due to credential failure do not silently drop errors; the credential health status is updated before the next user-visible page load.

#### FR-5: Repository State on Page Load

Platform reads current `_bmad-output/` state from the Repository on page load and on manual refresh.

**Consequences (testable):**

- Project Map contents reflect the latest committed state of the Repository at the time of the most recent page load or manual refresh.
- A manual refresh control is visible on the Project Map.
- No real-time push detection in MVP; Repository state does not update automatically while the page is open.

---

### 4.2 Project Map

**Description:** The Project Map is the platform's home screen and central metaphor — the surface that makes BMAD's skill-by-skill execution feel like a coherent, living project. It shows what BMAD work the team has produced (completed Artifacts) and what is in progress (open Skill Sessions on the platform), drawn directly from the Repository's `_bmad-output/` directory. No state lives in the platform; everything the Project Map shows is derived from git or from active platform session state. This is the MVP form of the Project Map — a structured Artifact list, not a visual workflow graph. Realizes UJ-3.

**Functional Requirements:**

#### FR-6: Project Map Artifact List

Authenticated user with a connected Repository sees the Project Map as their home screen: a list of Artifacts from `_bmad-output/`, organized by artifact type and status.

**Consequences (testable):**

- Artifacts are listed with: artifact type (e.g., brainstorming, PRD, brief), title derived from file frontmatter or path, and status (completed / in-progress).
- In-progress Artifacts associated with an active Skill Session open in a tab on this platform are visually distinguished from completed Artifacts.
- Artifacts produced by developers through local tooling appear alongside platform-produced Artifacts; the source of production is not distinguished.
- Empty state (no `_bmad-output/` content) shows a prompt to start the first Skill Session.

**Out of Scope:** Visual workflow map, workflow node graph, artifact dependency graph, artifact health indicators (post-MVP).

#### FR-7: Manual Refresh

User can manually refresh the Project Map to reflect recently committed Artifacts.

**Consequences (testable):**

- Refresh re-reads `_bmad-output/` from the Repository.
- Refresh does not interrupt active Skill Sessions.
- A refresh indicator is visible during the read operation.

#### FR-8: Navigation from Project Map

Clicking a completed Artifact on the Project Map opens it in the Artifact Browser. Clicking an in-progress Artifact with an open Skill Session tab brings that tab into focus.

**Consequences (testable):**

- Click on a completed Artifact navigates to the Artifact Browser with that Artifact loaded.
- Click on an in-progress Artifact whose Skill Session tab is currently open brings that tab into focus.
- Click on an in-progress Artifact whose Skill Session tab is not open opens the Artifact in read-only Artifact Browser.

---

### 4.3 Skill Execution

**Description:** Each Skill runs in a dedicated chat tab. The user selects a BMAD Skill from a list derived from the Repository's `_bmad/skills/` directory, and the tab becomes a streaming chat conversation with the BMAD Agent. The interaction is identical to what a developer has with their local agent harness — the same Skills, the same BMAD prompts, the same Artifact output — without any terminal or IDE involvement. When the BMAD Agent commits an Artifact, a Commit Pill appears inline in the chat. Multiple Skills can run concurrently in parallel tabs.

The Sandbox is provisioned when the tab is opened (not when the first message is sent), so the git clone phase runs in the background while the user reads the chat interface. The chat is ready within seconds of the tab opening. Realizes UJ-2.

**Functional Requirements:**

#### FR-9: Skill Session Initiation

User can start a new Skill Session by selecting a BMAD Skill from the available list.

**Consequences (testable):**

- Available Skills are derived from the connected Repository's `_bmad/skills/` directory.
- Selecting a Skill opens a new tab labelled with the Skill name.
- A Sandbox is provisioned and the Repository is cloned inside it as a background operation at tab-open time; the chat interface is visible immediately with a loading indicator.
- P95 target: chat ready for user input within 10 seconds of tab open.
- Skill Session initiation is blocked with a clear upgrade prompt for users who have exceeded their Seat allocation.

#### FR-10: Streaming Chat Interface

User converses with the BMAD Agent in a chat interface; agent responses stream token-by-token with Markdown rendering.

**Consequences (testable):**

- Agent responses stream progressively; the user sees tokens as they are produced.
- Markdown formatting (headings, lists, code blocks, bold, italic, tables) is rendered in agent responses.
- A thinking indicator is displayed while the BMAD Agent is processing a response.
- Time to first streamed token after user sends a message: P95 < 1,500 ms.
- Chat input is a plain text field with send and cancel controls. No rich-text toolbar, no file attachment input.

#### FR-11: Multi-Session Tabs

User can have multiple Skill Sessions open concurrently in separate tabs alongside the Project Map tab.

**Consequences (testable):**

- The Project Map tab is always present; Skill Session tabs appear alongside it.
- Each Skill Session tab maintains an independent Sandbox and independent chat history.
- [ASSUMPTION: A-5] A per-user maximum concurrent active Skill Sessions limit is enforced at the platform level.
- Opening a new tab beyond the concurrent session limit shows a "session limit reached" message rather than silently failing.

#### FR-12: Inline Commit Pills

When the BMAD Agent commits an Artifact during a Skill Session, a Commit Pill appears inline in the chat stream at the point of the commit event.

**Consequences (testable):**

- Commit Pill displays: Artifact type, Artifact title, and a "View" action.
- Clicking "View" opens the Artifact in the Artifact Browser.
- Commit Pill is triggered by the platform's `PostToolUse` hook on `git commit` commands executed inside the Sandbox; it is part of the chat stream, not a separate notification channel.
- Multiple Artifact commits in a single session each produce a distinct Commit Pill at the position in the chat where they occurred.

#### FR-13: Session Persistence within Idle Timeout

A Skill Session persists across browser refreshes and reconnects as long as the Sandbox is still live.

**Consequences (testable):**

- Reconnecting to an active Skill Session within the idle timeout restores the full chat history.
- Sandboxes idle for 30 minutes are paused; the session chat history is visible on reconnect but the BMAD Agent cannot resume processing without a new Skill Session.
- An expired Skill Session tab displays a clear end-of-session indicator; the user can start a new Skill Session for the same Skill.

#### FR-14: No Hard Session Duration Limit

The platform does not enforce a maximum session duration. Sessions remain active as long as the user is engaging, regardless of total elapsed time. Sessions end only via the idle timeout in FR-13.

**Consequences (testable):**

- A Skill Session that has been running for more than 2 hours with ongoing user activity is not terminated by the platform.
- The idle timeout (30 minutes of no user activity) is the sole mechanism by which the platform ends a session.
- Platform spend monitoring (NFR-O1) is the operational safeguard against runaway sessions, not a session duration limit.

---

### 4.4 Artifact Browser

**Description:** The Artifact Browser provides a clean read-only view of any committed Artifact from the Repository. Its job is to make BMAD output readable to non-dev team members without GitHub's file-navigation interface. It is accessed from the Project Map and from Commit Pills; it has no stand-alone navigation and no editing capability. Realizes UJ-2 (resolution), UJ-3.

**Functional Requirements:**

#### FR-15: Artifact Rendering

User can view any committed Artifact from `_bmad-output/` as rendered Markdown.

**Consequences (testable):**

- Artifact content is read directly from the Repository at its latest committed revision.
- Content is rendered with standard Markdown formatting (headings, lists, tables, code blocks, bold, italic).
- The Artifact Browser is read-only; no editing controls are present.
- Artifact load time for files up to [ASSUMPTION: A-11, 500 KB]: P95 < 2 seconds.

#### FR-16: Artifact Access Points

Artifact Browser is accessible from the Project Map and from Commit Pills in Skill Session chat.

**Consequences (testable):**

- Both entry points resolve to the same rendered view of the Artifact at its latest committed state.
- "Back" navigation from the Artifact Browser returns the user to their entry point (Project Map or Skill Session tab).

---

### 4.5 Authentication & Access Control

**Description:** Users authenticate with the platform via GitHub OAuth or email/password. All platform access — Project Map, Artifact Browser, and Skill Sessions — requires an active Seat or an active free trial. There is no read-only free tier. Repository access permissions are governed by the GitHub permissions attached to the user's PAT; no separate platform access control layer exists in MVP.

**Functional Requirements:**

#### FR-17: Platform Authentication

User can authenticate with the platform using GitHub OAuth (primary) or email/password (fallback).

**Consequences (testable):**

- GitHub OAuth is the default authentication path at the sign-up and sign-in screen.
- Session persists across browser refreshes until explicit logout or session expiry [ASSUMPTION: A-12, 7-day session].
- A user who authenticates via GitHub OAuth and the same user who authenticates via email/password are treated as separate accounts unless linked.

#### FR-18: Seat-Gated Skill Sessions

All platform access requires an active Seat license or an active free trial.

**Consequences (testable):**

- A user without a Seat or active trial cannot log in to the platform; they are redirected to the sign-up / purchase flow.
- During an active trial, all features (Project Map, Artifact Browser, Skill Sessions) are available without restriction.
- At trial expiry with no Seat purchased, the user is shown a paywall; no platform features are accessible until a Seat is purchased.
- Seat limits are enforced at Skill Session initiation; a user can hold a Seat and still be blocked if concurrent session limits are reached.

---

## 5. Non-Goals (Explicit)

- **BMAD initialization.** The platform does not set up `_bmad` in Repositories. That remains a developer responsibility and a prerequisite for any use of the platform.
- **Terminal or IDE access.** The platform is not a general-purpose code environment or a hosted IDE.
- **Branching and pull request workflows.** All git writes go to the main branch in MVP. Branch-based proposal and review workflows are post-MVP.
- **Real-time collaborative Skill Sessions.** Multiple users cannot cooperate inside a single Skill Session simultaneously in MVP.
- **Proactive workflow nudging.** The platform does not prompt the user to run the next Skill or push a workflow agenda. It executes the Skill the user selects.
- **PM tool integrations.** No Jira, Confluence, Linear, or equivalent in MVP. Artifacts live in the Repository.
- **Self-hosted or on-premise deployment.** SaaS only in MVP.
- **Non-GitHub git providers.** GitLab, Bitbucket, Azure DevOps, and others are out of scope for MVP.
- **User-selectable LLM model.** The model used by the BMAD Agent is hardcoded for MVP.
- **BMAD Skill authoring.** Users cannot create or modify BMAD Skills through the platform. Skill definitions in `_bmad/skills/` are managed by developers.
- **Artifact editing.** Users cannot edit committed Artifacts through the Artifact Browser.

---

## 6. MVP Scope

### 6.1 In Scope

- GitHub OAuth platform authentication + email/password fallback
- Repository connection via URL + fine-grained GitHub PAT; PAT stored AES-256-GCM encrypted
- Repository BMAD validation (`_bmad/` presence check) with a clear error path if absent
- Project Map: Artifact list from `_bmad-output/`, in-progress / completed status, manual refresh
- Skill Execution: streaming chat interface, BMAD Skills from the connected Repository, inline Commit Pills, multi-session tabs
- Artifact Browser: read-only rendered Markdown view of committed Artifacts
- Commit attribution per user (git author/committer identity injected per session)
- Credential health monitoring with re-auth prompt on 401/403
- SaaS deployment; per-seat subscription with free trial
- Single Runner (Claude Code); LLM model hardcoded

### 6.2 Out of Scope for MVP

- GitHub App installation flow, which removes PAT copy-paste from onboarding (post-MVP; trigger: PAT friction is identified as a material activation blocker in beta) [NOTE FOR PM: this is the single highest-impact UX improvement in Phase 2 — consider fast-tracking it based on trial activation data]
- Non-GitHub git providers (post-MVP; trigger: paying customer with an explicit requirement)
- Branching / pull request workflows (post-MVP enterprise feature)
- Real-time Repository push detection / webhooks (Repository state refreshes on page load and manual refresh only)
- Proactive Skill suggestions or workflow nudging (requires PM tool integrations; out of scope)
- PM tool integrations (Jira, Confluence, Linear — post-MVP)
- Self-hosted deployment
- User-selectable LLM model (post-MVP)
- Artifact commit failure error handling and retry logic (BMAD's design minimises conflict risk at MVP scale; visible error states and retry are post-MVP)
- In-app async completion badge when switching tabs during a long session (post-MVP)
- Role-based access controls beyond Seat / no-Seat (post-MVP)
- Observability dashboards and per-user token usage reporting visible to administrators (post-MVP; internal spend monitoring is in scope from day one)
- Multi-repository connections per account (post-MVP)

---

## 7. Cross-Cutting NFRs

### Security

- **NFR-S1 (Cross-tenant memory isolation):** `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` must be set in every Sandbox environment. Failure to set this flag allows the BMAD Agent to load user memory across sessions — a critical multi-tenant data isolation breach.
- **NFR-S2 (Host tool stripping):** The Claude Agent SDK `query()` call must set `tools: []` to strip all built-in SDK tools (Bash, Read, Write, Edit, Glob, Grep) from the host NestJS process. The BMAD Agent must not be able to execute any tool outside its Sandbox.
- **NFR-S3 (Credential isolation):** Repository PATs must never be resolved across users. Every git credential lookup must pass through a tenant authorization check at the service layer before a credential is resolved.
- **NFR-S4 (Active sandbox termination on deactivation):** When a user account is deactivated, all active Sandboxes for that user must be terminated immediately via the Daytona API. Passive rejection of new session requests is insufficient.
- **NFR-S5 (PAT storage):** Fine-grained GitHub PATs are stored AES-256-GCM encrypted with KMS envelope encryption. PATs are never returned to the client after initial submission.
- **NFR-S6 (HTTP/2 at SSE endpoint):** HTTP/2 must be enabled at the load balancer terminating TLS for the agent SSE endpoint. HTTP/1.1 caps browser connections at 6 concurrent SSE connections per origin; users with more than 6 Skill Session tabs open will have sessions hang under HTTP/1.1.

### Performance

- **NFR-P1:** Time to first streamed token after user sends a message: P95 < 1,500 ms.
- **NFR-P2:** Sandbox provisioning (tab-open to chat-ready): P95 < 10 seconds.
- **NFR-P3:** Project Map page load: P95 < 2 seconds.
- **NFR-P4:** Artifact Browser load for Artifacts up to 500 KB: P95 < 2 seconds.

### Reliability

- **NFR-R1 (Credential health):** Credential health status must update within one git operation cycle of a 401/403 response. Silent credential failures are not acceptable.
- **NFR-R2 (Session recovery from git):** Committed Artifacts are always recoverable from the Repository, independent of Sandbox state. Uncommitted in-session state is ephemeral and may be lost on Sandbox failure.
- **NFR-R3 (SSE back-pressure):** The NestJS SSE handler must honor `res.write()` back-pressure and pause token emission when the client cannot consume. Silent event dropping under load is not acceptable.

### Observability

- **NFR-O1 (Spend monitoring):** Platform must track per-user LLM spend via `ResultMessage.total_cost_usd` from the Agent SDK from day one. Budget alerting for anomalous per-user spending must be operational at launch.

---

## 8. Constraints & Guardrails

**Platform.** Web application, accessed through any modern browser. No mobile native app, no PWA, no desktop client in MVP.

**Sandbox isolation level.** Daytona Cloud uses Docker (shared kernel) with optional Kata Containers — classified as medium isolation. This is acceptable for MVP given authenticated users directing agent work on their own Repositories. If evidence of adversarial use emerges, upgrading to Firecracker microVM isolation (Fly.io Sprites or E2B) is the documented escalation path; this migration is bounded to the `SandboxService` abstraction layer. [ASSUMPTION: A-2]

**Daytona Cloud as a critical dependency.** Agent Sandbox execution depends on Daytona Cloud's availability. Daytona OSS self-hosting (AGPL-3.0) is the documented continuity fallback; migration is contained to the `SandboxService` layer. [ASSUMPTION: A-9]

**Agent SDK credit billing.** Claude Agent SDK sessions draw from a separate monthly credit pool; API key authentication is required. OAuth via claude.ai is not permitted for third-party platforms (billing model as of June 15, 2026). Platform API costs are metered separately from any personal Claude subscriptions team members may hold. [ASSUMPTION: A-3]

**Custom AG-UI emitter.** No official TypeScript adapter between the Claude Agent SDK and the AG-UI protocol exists at the time of writing (tracked upstream in ag-ui-protocol/ag-ui issue #439). The `ClaudeAgentSdkHarness` AG-UI emitter must be built and maintained internally until an official package is published. [ASSUMPTION: A-4]

**Main branch only.** All git writes go to the main branch. BMAD's design minimises direct write conflicts (Skills write to distinct Artifact paths); however, two concurrent sessions committing to the same path will result in last-write-wins. This is a known constraint, not an error condition for MVP.

**Stateful agent backend.** A single NestJS container hosts the agent backend for MVP — no horizontal scaling, no shared session registry across containers. This is a conscious scope decision; horizontal scaling is a post-MVP architectural change.

**GitHub only.** Repository connection is GitHub-only in MVP. A `GitCredentialProvider` abstraction interface will be the extension point when a second git provider is added post-MVP.

**LLM model.** The BMAD Agent runs `claude-sonnet-4-6` (hardcoded for MVP). Model selection is not exposed to users. This decision is reflected in cost modelling and credit pool sizing for the Agent SDK billing plan.

**EU Data Act (effective September 2025).** Data portability in machine-readable formats and mandatory switching rights must be designed into the product architecture from launch. These cannot be retrofitted.

**SOC 2.** SOC 2 Type II is a gating requirement for mid-market sales. Begin the certification process at approximately 6 months post-launch; estimated cost $30K–$80K.

---

## 9. Why Now

BMAD's practitioner community has grown rapidly since the npm launch in June 2025: 49,000 GitHub stars, 5,680 forks, 370 releases in 12 months. The community is active, expanding, and producing practitioner guides that are driving non-dev adoption of BMAD-adjacent tooling.

Claude Code Web, launched by Anthropic in October 2025, simultaneously validates the market — Anthropic is reducing the non-dev access barrier — and defines the competitive window. Non-technical PMs are already self-adopting Claude Code Web using practitioner guides. As Claude Code Web matures, the "browser-native access" differentiation narrows. bmad-easy's durable advantages — BMAD-structured sessions, automatic Artifact commitment, Project Map, team billing, no per-user Claude subscription required — must be in users' hands within 12–18 months of Claude Code Web's launch.

Developer tooling SaaS pricing increased 57% between 2024–2026. Willingness to pay for AI tooling is at a historic high, and the $20–$30/seat/month reference price is well-established by comparable products.

The estimated first-mover window before platform encroachment is 12–24 months.

---

## 10. Monetization

Per-seat SaaS subscription. Target price point: **$25–$30/seat/month**, aligned with ChatGPT Teams ($25/seat/month), AWS Kiro ($20/seat/month), and the established norm for AI productivity tools in this category. Pricing below $20/seat signals commodity.

Free trial: **14 days, no credit card required at sign-up.** Low-friction activation is essential for the developer champion's self-serve evaluation path.

No freemium tier. No self-hosting.

Self-serve sales motion for purchases below $5,000 ACV (~16 seats at $25/seat/month). Sales-assist becomes appropriate above $5,000 ACV.

**Post-MVP consideration:** Hybrid base-seat + LLM usage passthrough model. Per-seat pricing is under structural pressure from usage-based models (Gartner: 70% of businesses will prefer usage-based by 2026). The V2 pricing model should plan for a hybrid structure; MVP should not be over-engineered around it.

---

## 11. Success Metrics

**Primary**

- **SM-1: Unassisted session completion rate.** Percentage of new non-dev users who complete a full Skill Session (conversation through to a committed Artifact) without assistance. Target: ≥ 60% in the first 30 days post-signup. Validates FR-9, FR-10, FR-12, and UJ-2.
- **SM-2: Session repeat rate.** Percentage of non-dev users who complete a second Skill Session within 14 days of their first. Target: ≥ 40%. Validates that the product is an invitation, not a one-time exercise. Validates FR-13.

**Secondary**

- **SM-3: Team activation rate.** Percentage of paying accounts in which at least 3 Skill Sessions are completed by a non-dev user in the first 90 days. Target: ≥ 50%. Validates product-team fit.
- **SM-4: Artifact utilization.** Percentage of Artifacts produced via the platform that are referenced in a subsequent developer Skill Session or in team-external documents (sprint notes, issue tracker, design brief) within 30 days of commit. Target: ≥ 30%. Validates that platform-produced Artifacts are usable by the full team.
- **SM-5: VP/Director buyer conversion.** At least one paying team includes a Director or VP-level buyer purchasing Seats at the full asking price within 6 months of launch. Validates the two-persona GTM model.
- **SM-6: Second-month retention.** Teams that pay for a second month run ≥ 4 Skill Sessions that month. Validates the tool has become part of the team's working rhythm.

**Counter-metrics (do not optimize)**

- **SM-C1: Session duration.** Do not optimize for long sessions. Long sessions may indicate the BMAD Agent is struggling rather than being productive. Counterbalances SM-1.
- **SM-C2: Seat count over activation.** Do not optimize for seat growth if activated users are not completing Skill Sessions. Empty seats are a vanity metric. Counterbalances SM-5.

**If this is not working**

If fewer than 2 teams reach 3 Skill Sessions within 90 days of launch, the experience requires fundamental rethinking before any further effort to grow the user base.

---

## 12. Open Questions

1. **Artifact commit timing model.** When exactly does the BMAD Agent commit Artifacts during a Skill Session? BMAD skills manage this through their own conventions, but the platform's Commit Pill implementation depends on a clear model for the commit event. Is it on `RUN_FINISHED`, on a specific tool call, or on a pattern the platform monitors? Requires architectural definition before FR-12 is implemented.

2. **Concurrent session limit per user.** What is the maximum number of concurrent active Skill Sessions a user can run? This depends on the Daytona Cloud tier selected and cost modelling. A number must be confirmed before FR-11 is finalized. (A-5)

3. **Concurrent session limit queue UX.** When a user hits the concurrent session limit, does the platform queue the new session with a "preparing session" indicator, or show a hard error? The UX for this state is undefined.

4. **Repository size limit.** Is there a maximum repository size for connection? Large repositories could cause git clone times that exceed the P95 < 10-second tab-open target.

---

## 13. Assumptions Index

- **A-1:** The connected Repository has `_bmad/` already initialized by a developer. bmad-easy does not set up BMAD. (§4.1 FR-2, §5)
- **A-2:** Daytona Cloud Docker-level isolation is acceptable for authenticated, non-adversarial users in MVP. Upgrade to Firecracker microVM isolation is the documented escalation trigger if adversarial use is detected. (§8)
- **A-3:** Claude Agent SDK billing applies via API key and separate credit pool as of June 15, 2026. OAuth via claude.ai is not permitted for third-party platforms. (§8)
- **A-4:** No official TypeScript adapter between the Claude Agent SDK and the AG-UI protocol exists. The `ClaudeAgentSdkHarness` emitter must be built and maintained internally. (§8)
- **A-5:** A per-user maximum concurrent active Skill Sessions limit is enforced at the platform level; specific number is TBD pending Daytona tier selection and cost modelling. (§4.3 FR-11, Q-2)
- **A-6:** ~~RESOLVED~~ No hard session duration limit. Sessions end on idle timeout only (30 min). (§4.3 FR-14)
- **A-7:** ~~RESOLVED~~ All platform access requires a Seat or active trial; no read-only free tier. (§4.5 FR-18)
- **A-8:** Fine-grained GitHub PAT is acceptable onboarding friction for MVP. GitHub App integration is the post-MVP replacement; trigger is PAT friction identified as a material activation blocker in beta. (§6.2)
- **A-9:** Daytona Cloud is the MVP sandbox platform. Daytona OSS self-hosting is the documented continuity fallback; migration is bounded to the `SandboxService` layer. (§8)
- **A-10:** ~~RESOLVED~~ 14-day free trial, no credit card required at sign-up. (§10)
- **A-11:** Artifact Browser load performance target applies to Artifacts up to 500 KB. Larger Artifacts may require a fallback rendering path. (§4.4 FR-15)
- **A-12:** Platform session expiry is 7 days after last activity. (§4.5 FR-17)
