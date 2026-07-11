---
project_name: bmad-easy
date: '2026-07-11'
target_epic: 'Epic 5'
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentsIncluded:
  - prds/prd-bmad-easy-2026-06-14/prd.md
  - architecture.md
  - epics.md
  - ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md
  - ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-11
**Project:** bmad-easy
**Target:** Epic 5

## Step 1: Document Discovery

### Document Inventory

#### PRD

| File | Size | Modified |
|------|------|----------|
| `prds/prd-bmad-easy-2026-06-14/prd.md` | 48 KB | 2026-07-11 |

Companion files: `.decision-log.md`, `review-adversarial-general.md`, `review-rubric.md`, `strategy.md`, `validation-report.md`

#### Architecture

| File | Size | Modified |
|------|------|----------|
| `architecture.md` | 61 KB | 2026-07-11 |

#### Epics & Stories

| File | Size | Modified |
|------|------|----------|
| `epics.md` | 79 KB | 2026-07-11 |

#### UX Design

| File | Size | Modified |
|------|------|----------|
| `ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` | 23 KB | 2026-07-11 |
| `ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` | 34 KB | 2026-07-11 |

Companion files: `.decision-log.md`, `review-aesthetics.md`, `review-implementation-drift.md`, `review-rubric.md`, `validation-report.md`, `mockups/`

#### Additional Context Documents

- **Product Brief:** `briefs/brief-bmad-easy-2026-06-12/` (brief.md, addendum.md, .decision-log.md)
- **Research:** 11 research reports (technical + market + domain)
- **Sprint Change Proposals:** 3 files (2026-07-01, 2026-07-08, 2026-07-11)
- **Previous Readiness Report:** `implementation-readiness-report-2026-07-02.md`

### Issues Found

- **Duplicates:** None detected.
- **Missing Documents:** None — all four required document types present.

## Step 2: PRD Analysis

### Functional Requirements

#### Feature 4.1: Repository Connection & Onboarding

- **FR-1: Repository Connection via URL** — User can connect a GitHub Repository by providing its URL. Platform uses the user's GitHub OAuth access token (authorized with `repo` scope at sign-in) to validate and establish the connection. URL input field only; no token entry. Validates write access. Descriptive error on failure (permission, org restriction). OAuth token stored encrypted at rest. Redirect to Project Map on success.
- **FR-2: BMAD Initialization Validation** — Platform validates that the connected Repository contains `_bmad/`, `_bmad-output/`, `.claude/` before activating. BMAD v6.x only. Blocking message if absent. Empty `_bmad-output/` acceptable. Version check with blocking message if outside v6.x. Skills presence check (`.claude/skills/` must have at least one Skill file).
- **FR-3: Commit Attribution per User** — Commits produced in a user's session are attributed to the user's GitHub OAuth identity (name and primary email). Injected into Sandbox git config at session init. Fallback to `{github_username}@users.noreply.github.com` if no primary email. OAuth token used for HTTPS transport only; not in git commit record. Distinct author identities for different users.
- **FR-4: Credential Health Monitoring** — Platform monitors stored credentials and surfaces re-auth prompt when expired/revoked. 401 updates credential health to `failed` within one operation cycle. 403 classified (rate limit, org restriction, permission denial) — does not mark credential as failed. Project Map displays re-auth notification. Re-authorize flow without disconnecting. Background operation failures don't silently drop errors.
- **FR-5: Repository State on Page Load** — Platform reads current `_bmad-output/` state on page load and manual refresh. Project Map reflects latest committed state. Manual refresh control visible. No real-time push detection in MVP.

#### Feature 4.2: Project Map

- **FR-6: Project Map Artifact List** — Authenticated user with connected Repository sees Project Map as home screen: list of Artifacts from `_bmad-output/`, organized by type and status. Artifacts listed with type, title, status (completed/in-progress). In-progress Artifacts visually distinguished. Developer-produced and platform-produced Artifacts appear alongside. Empty state prompt to start first Conversation.
- **FR-7: Manual Refresh** — User can manually refresh Project Map. Refresh re-reads `_bmad-output/`. Does not interrupt active Conversations. Refresh indicator visible during read.
- **FR-8: Navigation from Project Map** — Clicking completed Artifact opens Artifact Browser. Clicking in-progress Artifact with active Conversation navigates to that Conversation. Clicking in-progress Artifact without active Conversation opens read-only Artifact Browser.

#### Feature 4.3: Conversations

- **FR-9: Conversation Initiation** — User can open new Conversation from Project Map. Skills derived from `.claude/skills/` directory, presented as slash-command suggestions. New Conversation via "New Conversation" action or side navigation button. Typing `/` displays filterable Skill list. No Skill selection required before first message. No permanent URL until first message sent. Sandbox provisioned and Repository cloned as background operation when page opens. Spinner and "Starting session…" label during provisioning. Chat input disabled until Sandbox ready. Chat ready within 10 seconds (NFR-P2). Blocked with upgrade prompt for users exceeding Seat allocation.
- **FR-10: Streaming Chat Interface** — Agent responses stream token-by-token with Markdown rendering. First token within 1,500 ms (NFR-P1). Multi-line auto-growing textarea. Enter submits, Shift+Enter newline. Send button secondary. Stop button visible during processing — terminates LLM response and tool/Bash process, not the Sandbox. Copy-to-clipboard per message and per code block. Scroll-to-bottom button. Auto-scroll during streaming unless user scrolled up. Timestamps (relative "just now" for recent, wall-clock for older). Draft message persisted across refreshes, cleared on send.
- **FR-11: Concurrent Conversations** — Multiple Conversations active concurrently, each at own stable URL. Each has independent Sandbox and chat history. 2–5 word semantic title. Per-user maximum of 10 concurrent active Conversations. "Session limit reached" message beyond limit.
- **FR-12: Tool Call Visibility and Semantic Recognition** — All agent tool calls produce Tool Pills inline at position where action occurred. `git commit` promoted to Semantic Pill displayed as "Progress saved" with Artifact type, title, and "View" link. Semantic Pill emitted only after confirmed commit success. Failed `git commit` produces error-state Tool Pill. Clicking "View" opens Artifact Browser. Multiple recognized actions produce distinct Semantic Pills. `git commit` is the only Semantic Pill action for MVP. Failed tool calls appear as error-state Tool Pills with error description. No automatic retry.
- **FR-13: Conversation Persistence** — Conversation always resumable. Navigating to Conversation restores full chat history. Platform manages session re-initialization transparently with loading indicator.
- **FR-14: Working Tree State Indicator** — Persistent status indicator in chat input area showing committed/uncommitted state. `● Unsaved changes` (amber) when dirty, `✓ All saved` (muted) or hidden when clean. Updates after each agent action or manual save.
- **FR-15: Manual Commit** — User can commit working tree on demand via Save control. Status indicator clickable when dirty. Confirmation labeled "Save" — no git vocabulary. Executes platform-level commit inside Sandbox, bypassing Agent. Does not execute while agent turn is in progress — fires when agent next idle. Commit message format `chore(platform-save): checkpoint [<ISO8601 UTC>]`. On success: Semantic Pill and indicator resets. On failure: error-state Tool Pill, indicator remains dirty, no partial state. Save control disabled during save operation. No-op if working tree clean.

#### Feature 4.4: Artifact Browser

- **FR-16: Artifact Rendering** — User can view committed Artifacts from `_bmad-output/` as rendered Markdown. Single page with two layout states: full-width flat list (direct access) and list + rendered Artifact (selected). Reverse commit-date order. Content read from Repository at latest committed revision. Standard Markdown rendering. Read-only. Loads within 2 seconds (NFR-P4).
- **FR-17: Artifact Access Points** — Artifact Browser accessible from Project Map and Semantic Pills in Conversation chat. Both entry points resolve to same rendered view. "Back" navigation returns to entry point.

#### Feature 4.5: Authentication & Access Control

- **FR-18: Platform Authentication** — User authenticates via GitHub OAuth. Only auth path. Session persists across browser refreshes until logout or expiry. Minimum 8-hour session lifetime.
- **FR-19: Access Control** — All platform access requires authenticated account. All MVP users auto-enrolled in full-access plan with no expiry. No paywall, trial expiry, or billing enforcement. Unauthenticated requests redirect to sign-in. All authenticated users have unrestricted access. Concurrent session limits (FR-11) enforced regardless.

**Total FRs: 19**

### Non-Functional Requirements

#### Security

- **NFR-S1 (Sandbox credential and network isolation):** Platform-internal credentials must not be injected into Sandbox. User's OAuth token explicitly permitted inside Sandbox for git transport. Sandbox network must not have routes to agent backend internal endpoints.
- **NFR-S2 (Credential isolation):** Repository OAuth tokens must never be resolved across users. Every git credential lookup must pass through tenant authorization check before credential is resolved.
- **NFR-S3 (Active sandbox termination on deactivation):** When user account is deactivated, all active Sandboxes for that user must be terminated immediately. Passive rejection of new sessions is insufficient.
- **NFR-S4 (OAuth token storage):** GitHub OAuth tokens encrypted when stored and never returned to client after initial submission.

#### Performance

- **NFR-P1:** First streamed token appears within 1,500 ms of user sending a message.
- **NFR-P2:** Chat is ready for user input within 10 seconds of opening a Conversation page (repos under ~200 MB).
- **NFR-P3:** Project Map loads within 2 seconds of page open.
- **NFR-P4:** Artifact Browser loads a committed Artifact within 2 seconds.
- **NFR-P5 (Manual commit latency):** Platform-initiated commit completes within 5 seconds of save operation executing (exclusive of queue time).

#### Reliability

- **NFR-R1 (Credential health):** Credential health status must update within one git operation cycle of a 401 response. 403 is not a credential failure — classified into rate limit, org restriction, or permission denial.
- **NFR-R2 (Session recovery from git):** Committed Artifacts are always recoverable from the Repository. In-progress uncommitted working tree state is not guaranteed to survive Sandbox restart.
- **NFR-R3 (SSE back-pressure):** Streaming transport must not silently drop events when client is slow. Must apply back-pressure and pause token emission until client is ready.
- **NFR-R4 (SSE connection capacity):** Streaming transport must support 10 concurrent agent SSE connections per browser session without connection starvation.

#### Observability

- **NFR-O1 (Spend monitoring):** Platform must track per-user LLM spend via Agent SDK's cost reporting from day one. Budget alerting for anomalous per-user spending must be operational at launch.

**Total NFRs: 13**

### Additional Requirements

#### Constraints

- Web application, modern browser only. No mobile native, PWA, or desktop client.
- Page-based navigation with breadcrumbs one level deep. No in-app tab UI.
- Persistent side navigation panel: last 5 Conversations, New Conversation button, Project Map and Artifact Browser links, user avatar → Settings (empty "coming soon" page).
- Daytona Cloud medium isolation for MVP. Escalation to VM-level isolation if adversarial use detected.
- Daytona Cloud is critical dependency. Daytona OSS self-hosting is continuity fallback.
- Claude Agent SDK via API key, separate monthly credit pool.
- Main branch only for all git writes. Last-write-wins for concurrent sessions.
- Single container backend for MVP — no horizontal scaling.
- GitHub only. Provider abstraction is post-MVP extension point.
- BMAD v6.x only.
- GitHub org OAuth App restrictions may block write access. No in-app workaround in MVP.
- LLM model hardcoded: `claude-sonnet-4-6`.
- EU Data Act compliance (data portability, switching rights) must be designed in from launch.
- SOC 2 Type II is gating requirement for mid-market sales (~6 months post-launch).

#### Open Questions

- **Q-1:** Repository size limit and NFR-P2 scope — architect to formally document size boundary.
- **Q-2:** Daytona compute cost estimate — architect to provide cost estimate before launch pricing locked.

#### Assumptions

- **A-1:** Repository has `_bmad/`, `_bmad-output/`, `.claude/` initialized, BMAD v6.x.
- **A-2:** Daytona Cloud Docker-level isolation acceptable for authenticated, non-adversarial users.
- **A-3:** Claude Agent SDK billing via API key, separate credit pool.
- **A-4:** Maximum 10 concurrent Conversations per user.
- **A-5:** All MVP users auto-enrolled in full-access plan, no expiry.
- **A-6:** GitHub OAuth App with `repo` scope. Broader than needed. GitHub App is post-MVP.
- **A-7:** Daytona Cloud is MVP sandbox platform. Daytona OSS is fallback.

### PRD Completeness Assessment

The PRD is well-structured and thorough:
- 19 FRs across 5 feature areas, each with testable consequences
- 13 NFRs across 4 categories (Security, Performance, Reliability, Observability)
- Clear non-goals section preventing scope creep
- Explicit assumptions indexed (A-1 through A-7)
- Open questions documented with owners
- Success metrics defined with targets and counter-metrics
- Strategy and monetization deferred to companion documents

The PRD is approved (status: approved, by John, 2026-07-02). No completeness gaps identified at the PRD level.

## Step 3: Epic Coverage Validation

### Epic FR Coverage Extracted

From the epics document's FR Coverage Map (lines 175-211):

| FR | Epic Coverage |
|----|---------------|
| FR1 | Epic 1 — Repository Connection via URL |
| FR2 | Epic 1 — BMAD Initialization Validation |
| FR3 | Epic 1 (Story 1.5 derives identity); end-to-end verification in Epic 3 (Story 3.10) |
| FR4 | Epic 1 — Credential Health Monitoring (real-time SSE propagation wired in Epic 3) |
| FR5 | Epic 2 — Repository State on Page Load |
| FR6 | Epic 2 — Project Map Artifact List |
| FR7 | Epic 2 — Manual Refresh |
| FR8 | Epic 2 — Navigation from Project Map (focus open Conversation tab completed in Epic 3) |
| FR9 | Epic 3 — Conversation Initiation |
| FR10 | Epic 3 — Streaming Chat Interface |
| FR11 | Epic 3 — Concurrent Conversations |
| FR12 | Epic 3 — Tool Call Visibility and Semantic Recognition |
| FR13 | Epic 3 — Conversation Persistence |
| FR14 | Epic 3 — Working Tree State Indicator |
| FR15 | Epic 3 — Manual Commit |
| FR16 | Epic 2 — Artifact Rendering |
| FR17 | Epic 2 — Artifact Access Points |
| FR18 | Epic 1 — Platform Authentication |
| FR19 | Epic 1 — Access Control |

### NFR Coverage Extracted

| NFR | Epic Coverage |
|-----|---------------|
| NFR-S1 | Epic 3 — Sandbox credential/network isolation |
| NFR-S2 | Epic 1 — Credential isolation (respected by Epic 3) |
| NFR-S3 | Deferred to post-MVP — no in-app deactivation flow in MVP |
| NFR-S4 | Epic 1 — OAuth token storage encryption |
| NFR-P1 | Epic 3 — First streamed token latency |
| NFR-P2 | Epic 3 — Chat ready within 10s |
| NFR-P3 | Epic 2 — Project Map load time |
| NFR-P4 | Epic 2 — Artifact Browser load time |
| NFR-P5 | Epic 3 — Manual commit latency |
| NFR-R1 | Epic 1 (update cycle); Epic 3 (real-time SSE propagation) |
| NFR-R2 | Epic 3 — Session recovery from git |
| NFR-R3 | Epic 3 — SSE back-pressure |
| NFR-R4 | Epic 3 — SSE concurrent connection capacity |
| NFR-O1 | Epic 3 — Per-user LLM spend monitoring |

### FR Coverage Analysis

| FR | PRD Requirement | Epic Coverage | Status |
|----|----------------|---------------|--------|
| FR1 | Repository Connection via URL | Epic 1 (Story 1.3) | ✓ Covered |
| FR2 | BMAD Initialization Validation | Epic 1 (Story 1.4) | ✓ Covered |
| FR3 | Commit Attribution per User | Epic 1 (Story 1.5) + Epic 3 (Story 3.10) | ✓ Covered (split) |
| FR4 | Credential Health Monitoring | Epic 1 (Story 1.6) + Epic 3 (Story 3.7) | ✓ Covered (split) |
| FR5 | Repository State on Page Load | Epic 2 (Story 2.1) | ✓ Covered |
| FR6 | Project Map Artifact List | Epic 2 (Story 2.2) | ✓ Covered |
| FR7 | Manual Refresh | Epic 2 (Story 2.3) | ✓ Covered |
| FR8 | Navigation from Project Map | Epic 2 (Story 2.6) + Epic 3 (Story 3.5) | ✓ Covered (split) |
| FR9 | Conversation Initiation | Epic 3 (Story 3.1, 3.2) | ✓ Covered |
| FR10 | Streaming Chat Interface | Epic 3 (Story 3.3) | ✓ Covered |
| FR11 | Concurrent Conversations | Epic 3 (Story 3.11) | ✓ Covered |
| FR12 | Tool Call Visibility and Semantic Recognition | Epic 3 (Story 3.4) | ✓ Covered |
| FR13 | Conversation Persistence | Epic 3 (Story 3.5) | ✓ Covered |
| FR14 | Working Tree State Indicator | Epic 3 (Story 3.6) | ✓ Covered |
| FR15 | Manual Commit | Epic 3 (Story 3.6) | ✓ Covered |
| FR16 | Artifact Rendering | Epic 2 (Story 2.4, 2.5) | ✓ Covered |
| FR17 | Artifact Access Points | Epic 2 (Story 2.5) | ✓ Covered |
| FR18 | Platform Authentication | Epic 1 (Story 1.2) | ✓ Covered |
| FR19 | Access Control | Epic 1 (Story 1.7) | ✓ Covered |

### Missing Requirements

None. All 19 FRs have traceable epic coverage.

### NFR Coverage Analysis

| NFR | Status |
|-----|--------|
| NFR-S1 | ✓ Covered (Epic 3, Story 3.8) |
| NFR-S2 | ✓ Covered (Epic 1, Story 1.6) |
| NFR-S3 | ⚠️ Deferred to post-MVP (explicitly documented — no in-app deactivation flow in MVP scope) |
| NFR-S4 | ✓ Covered (Epic 1, Story 1.3) |
| NFR-P1 | ✓ Covered (Epic 3, Story 3.3) |
| NFR-P2 | ✓ Covered (Epic 3, Story 3.1) |
| NFR-P3 | ✓ Covered (Epic 2, Story 2.2) |
| NFR-P4 | ✓ Covered (Epic 2, Story 2.5) |
| NFR-P5 | ✓ Covered (Epic 3, Story 3.6) |
| NFR-R1 | ✓ Covered (Epic 1 Story 1.6 + Epic 3 Story 3.7) |
| NFR-R2 | ✓ Covered (Epic 3, Story 3.5) |
| NFR-R3 | ✓ Covered (Epic 3, Story 3.3) |
| NFR-R4 | ✓ Covered (Epic 3, Story 3.11) |
| NFR-O1 | ✓ Covered (Epic 3, Story 3.8) |

### Coverage Statistics

- **Total PRD FRs:** 19
- **FRs covered in epics:** 19
- **FR coverage percentage:** 100%
- **Total NFRs:** 13
- **NFRs covered in epics:** 12 (NFR-S3 explicitly deferred to post-MVP with documented rationale)
- **NFR coverage percentage:** 92% (100% of in-scope NFRs)

### Epic 5 Context

Epic 5 ("UX Mockup Fidelity — Close Visual Drift") does not claim FR or NFR coverage in the traditional sense. It is a quality/polish epic that addresses 102 findings of visual drift between the authoritative UX mockups and the implemented application. Epic 5 contains 4 stories:

- **Story 5.1:** Restore Missing Visual Containers Across Surfaces (sign-in, onboarding, settings, artifact browser, conversation)
- **Story 5.2:** Fix Shared Shell and Page-Header Structural Drift (side nav, breadcrumbs, page headers)
- **Story 5.3:** Fix Conversation Stream Structural Drift (inline pills, column centering, empty states, disabled button styling)
- **Story 5.4:** Fix Token-Usage Drift and Token-Config Gaps (hover tokens, input backgrounds, scrollbar hiding, box-shadow token, font weight enforcement)

Epic 5's work touches surfaces delivered by Epics 1-3 but does not introduce new functional requirements. It aligns existing implementations to the UX design spec (UX-DR1 through UX-DR20).

## Step 4: UX Alignment

### UX Document Status

**Found** — two-file UX design set:
- `ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` (visual identity: color tokens, typography, radii, spacing, component specs)
- `ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` (behavioral spec: information architecture, state patterns, interaction primitives, accessibility, key flows)
- 7 HTML mockup files in `mockups/` subfolder

### UX ↔ PRD Alignment

| Area | UX Document | PRD | Status |
|------|-------------|-----|--------|
| User Journeys | EXPERIENCE.md Flows 1-3 (Sarah) | PRD UJ-1, UJ-2, UJ-3 | ✓ Aligned — protagonists and journeys match verbatim |
| Onboarding Model | EXPERIENCE.md Flow 1: single Repository URL input, no PAT field | PRD FR-1: URL input, no token entry; PRD DL-7 correction | ✓ Aligned — reconciliation documented across all three documents |
| Dark Mode | DESIGN.md: dark-mode-only for MVP | PRD: not explicit but not contradicted | ✓ Compatible — UX drives this decision |
| Side Navigation | EXPERIENCE.md: 240px fixed, last 5 conversations, New Conversation button, PM + AB links, avatar Settings | PRD §8: same specification | ✓ Aligned |
| Tool Pills / Semantic Pills | EXPERIENCE.md + DESIGN.md: inline at position, "Progress saved" for git commit | PRD FR-12: same specification | ✓ Aligned |
| Working Tree Indicator | DESIGN.md + EXPERIENCE.md: dirty/clean/hidden states, specific copy | PRD FR-14: same specification | ✓ Aligned |
| Manual Commit | EXPERIENCE.md: Save confirmation, no git vocabulary, queued behind agent turn | PRD FR-15: same specification | ✓ Aligned |
| Streaming Chat | EXPERIENCE.md: token-by-token, Markdown, thinking/tool indicators | PRD FR-10: same specification | ✓ Aligned |
| Concurrent Conversations | EXPERIENCE.md: 10 max, "session limit reached" | PRD FR-11: same specification | ✓ Aligned |
| Artifact Browser | EXPERIENCE.md + DESIGN.md: two layout states, read-only, rendered Markdown | PRD FR-16, FR-17: same specification | ✓ Aligned |
| Credential Health | EXPERIENCE.md: Credential Error Banner on PM, AB, and Conversation | PRD FR-4: re-auth notification on Project Map | ✓ Aligned — UX extends to Conversation (real-time, mid-session) |
| Accessibility | EXPERIENCE.md: comprehensive accessibility floor (focus rings, keyboard nav, live regions, motion) | PRD: no explicit accessibility NFRs | ✓ Compatible — UX-DR16 in epics captures this; UX drives |
| Scroll-to-Bottom | EXPERIENCE.md: bottom-center, new-message count | PRD FR-10: scroll-to-bottom button | ✓ Aligned |
| Draft Persistence | EXPERIENCE.md: localStorage keyed by conversationId | PRD FR-10: draft persisted across refreshes | ✓ Aligned |

### UX ↔ Architecture Alignment

| Area | UX Requirement | Architecture Support | Status |
|------|----------------|---------------------|--------|
| SSE Streaming (FR-10) | Token-by-token streaming with Markdown | Architecture: SSE + AG-UI event bridge, circuit breaker, heartbeat | ✓ Supported |
| 10 Concurrent SSE (NFR-R4) | 10 concurrent conversations | Architecture: HTTP/2-capable reverse proxy required | ✓ Supported |
| First Token Latency (NFR-P1) | 1,500ms first token | Architecture: no buffering, low-latency SSE path | ✓ Supported |
| Chat Ready in 10s (NFR-P2) | Sandbox ready on page open | Architecture: provision on page open, mandatory shallow clone (`--depth=1`) | ✓ Supported |
| Credential Failure Propagation (NFR-R1) | Real-time banner mid-conversation | Architecture: `CREDENTIAL_FAILURE` event on SSE channel, `tool-pill-classifier.service.ts` | ✓ Supported |
| Access Denied (403) Propagation | Access Notice component, no re-auth prompt | Architecture: `ACCESS_DENIED` event with `code` discriminator, `RATE_LIMITED`/`ORG_RESTRICTION`/`INSUFFICIENT_PERMISSION` | ✓ Supported |
| Manual Commit (FR-15) | Platform-level commit, bypassing agent | Architecture: `ManualCommitService`, queued behind agent turn idle | ✓ Supported |
| Component Library | shadcn/ui (Radix + Tailwind) | Architecture: shadcn/ui specified | ✓ Supported |
| No Global Client State | Local React state for ephemeral UI only | Architecture: no Redux/Zustand/React Query, Server Components + Server Actions | ✓ Supported |
| Draft Persistence | localStorage keyed by conversationId | Architecture: same specification | ✓ Supported |
| No Client-Side Revalidation | Manual browser reload | Architecture: deliberate — eliminates SSE vs Postgres disagreement | ✓ Supported |
| Session Start Timeout | Client-side timeout with Retry button | Architecture: distinct from server-side idle timeout, specified as a constraint | ✓ Supported |
| Sandbox Idle Timeout | N/A (UX doesn't specify server-side timeout) | Architecture: 60s default, configurable | ✓ Compatible |
| Circuit Breaker | "Agent stopped unexpectedly" system message | Architecture: terminate agent process via Daytona API, emit error event | ✓ Supported |
| Dead Connection Detection | Heartbeat for stalled connections | Architecture: SSE heartbeat comments on fixed interval | ✓ Supported |

### Alignment Issues

No misalignments found between UX, PRD, and Architecture. The one historical conflict (EXPERIENCE.md's original PAT-based onboarding flow) has been explicitly reconciled across all three documents per DL-7. The UX documents are well-integrated with both the PRD requirements and the architecture's technical decisions.

### UX Requirements Not Explicitly in PRD (Extensions, Not Conflicts)

- **Access Notice component** — derived from FR-4's 403 classification requirement and the architecture's `ACCESS_DENIED` event contract. UX specifies the visual treatment; PRD specifies the behavioral requirement; Architecture defines the event contract. All three are consistent.
- **Session start timeout with Retry** — UX specifies a client-side timeout with retry affordance. PRD doesn't explicitly mention it. Epics Story 3.1 includes it as an acceptance criterion. Architecture lists it as a constraint. No conflict.
- **UX-DR1 through UX-DR20** — 20 UX design requirements that elaborate how PRD FRs should be implemented visually. These are elaborations, not new functional requirements. All are mapped to epics (Epic 1: app shell DRs; Epic 2: PM/AB DRs; Epic 3: Conversation DRs).

### Warnings

None. UX documentation is complete, aligned with PRD and Architecture, and covers all user-facing surfaces.

## Step 5: Epic Quality Review

### Review Scope

Primary focus: **Epic 5** (target epic). Context review of Epics 1-3 for dependency and structural validation.

### Epic 5: UX Mockup Fidelity — Close Visual Drift

#### A. User Value Focus Check

| Check | Finding |
|-------|---------|
| Epic Title | "UX Mockup Fidelity — Close Visual Drift" — implementation-centric framing, not user-centric |
| Epic Goal | Closes visual drift between mockups and implementation across 7 surfaces |
| Value Proposition | Users benefit from polished, consistent UI — visual drift undermines trust in a tool built for non-dev users |

**Assessment:** Epic 5 is a quality/polish epic, not a feature epic. It delivers user value indirectly (visual consistency, professional appearance) rather than introducing new capabilities. The stories mitigate the implementation-centric framing with "As a user, I want..." openings. This is a **borderline case** — visual polish is genuine user value for a tool targeting non-dev users, but the epic's structure is technical debt remediation rather than feature delivery.

#### B. Epic Independence Validation

| Check | Finding |
|-------|---------|
| Forward dependencies | ✓ None — Epic 5 depends only on Epics 1-3 (backward) |
| Circular dependencies | ✓ None |
| Can function using prior epic outputs | ✓ — fixes drift on already-implemented surfaces |

#### C. Story Quality Assessment

##### Story 5.1: Restore Missing Visual Containers Across Surfaces

| Check | Status |
|-------|--------|
| Clear user value | ✓ "As a user, I want each screen to match its designed visual container structure" |
| Independent | ✓ No dependencies on other Epic 5 stories |
| Given/When/Then format | ✓ All ACs use proper BDD structure |
| Testable | ✓ Each AC references specific file paths and mockup line numbers |
| Error/edge cases | ✓ Covers blocking states (BMAD-not-found, repository-not-found) |
| Specific | ✓ References investigation file with exact line numbers |

**No issues found.**

##### Story 5.2: Fix Shared Shell and Page-Header Structural Drift

| Check | Status |
|-------|--------|
| Clear user value | ✓ "As a user navigating the platform, I want the shell and page headers to match the design" |
| Independent | ✓ No dependencies on other Epic 5 stories |
| Given/When/Then format | ✓ All ACs use proper BDD structure |
| Testable | ✓ References specific components and mockup line numbers |
| Error/edge cases | N/A — structural fixes, no error states |
| Specific | ✓ References investigation findings |

**⚠️ Major Issue — Unresolved Design Decisions:**

The Dev Notes flag that two shell findings "may be intentional redesigns rather than drift":
1. Nav links relocated from a top-grouped cluster to bottom-pinned
2. The "Settings" label removed leaving the avatar only

The story asks to "Confirm with design/PM whether the shell layout was deliberately changed from the mockup before 'fixing' the Settings-label or nav-link-placement items." This means some ACs (the "Settings" text label AC, the nav-link-placement AC) may be invalid if the changes were intentional. **This should be resolved before implementation begins** — implementing ACs that are then reversed wastes effort.

##### Story 5.3: Fix Conversation Stream Structural Drift

| Check | Status |
|-------|--------|
| Clear user value | ✓ "As a user in a conversation, I want the chat interface to match the design" |
| Independent | ✓ No dependencies on other Epic 5 stories |
| Given/When/Then format | ✓ All ACs use proper BDD structure |
| Testable | ✓ References specific components and mockup line numbers |
| Error/edge cases | N/A — structural fixes |
| Specific | ✓ References investigation findings with line numbers |

**⚠️ Major Issue — Architecturally Significant Change Disguised as Visual Drift:**

The first AC (inline tool/semantic pills within the agent's markdown stream) is not visual drift — it's a **data model change**. The Dev Notes acknowledge this: "It requires changing how `TOOL_CALL` and recognition events are stored and rendered — they must interleave within the agent's markdown stream at the position they occurred, rather than being emitted as separate standalone rows keyed off the message boundary."

This change affects:
- How `TOOL_CALL` events are stored (message-boundary-keyed → position-interleaved)
- How the frontend renders them (standalone rows → inline within markdown)
- Cross-check needed against Story 3.4 and UX-DR5

**This should be either:**
1. Split into its own story with explicit architectural scope, OR
2. Have its AC elevated with a prominent warning (not buried in Dev Notes) that it requires a data model refactor

The remaining ACs in Story 5.3 (column centering, empty state, spinner placement, disabled button styling, micro-drift) are genuine visual drift fixes and are fine.

##### Story 5.4: Fix Token-Usage Drift and Token-Config Gaps

| Check | Status |
|-------|--------|
| Clear user value | ⚠️ "As a developer maintaining the design system" — developer persona, not target user |
| Independent | ✓ No dependencies on other Epic 5 stories |
| Given/When/Then format | ✓ All ACs use proper BDD structure |
| Testable | ✓ Each AC references specific token names and expected values |
| Error/edge cases | N/A — token corrections |
| Specific | ✓ References DESIGN.md line numbers, specific token names |

**Minor Concern — Developer Persona:**

Story 5.4 uses "As a developer maintaining the design system" as the persona. This is honest (the story is about Tailwind config and design-token enforcement) but deviates from the project's target user personas (PMs, BAs, Delivery Leads). The user value is indirect — users benefit from correct tokens, but the story is framed as developer value. This is acceptable for a technical debt story, but should be acknowledged.

**Good Practice Noted:** The Dev Notes for the `theme.extend` → `theme` override change provide excellent staging guidance ("grep the codebase for default-palette utilities first, migrate any real uses to design-system tokens, then switch to full overrides so the change is a guardrail, not a regression").

#### D. Dependency Analysis

| Check | Status |
|-------|--------|
| Within-epic dependencies | ✓ Stories 5.1-5.4 are independently completable |
| Cross-epic dependencies | ✓ Backward only (Epic 5 depends on Epics 1-3) |
| Forward dependencies | ✓ None |
| Database creation timing | ✓ N/A — no database changes in Epic 5 |

#### E. Best Practices Compliance Checklist (Epic 5)

| Check | Status |
|-------|--------|
| Epic delivers user value | ⚠️ Borderline — visual polish is user value, but epic is structured as technical debt remediation |
| Epic can function independently | ✓ Depends only on prior epics |
| Stories appropriately sized | ✓ Each story covers a coherent drift category |
| No forward dependencies | ✓ |
| Database tables created when needed | ✓ N/A |
| Clear acceptance criteria | ✓ Specific with line references |
| Traceability to FRs maintained | ⚠️ Indirect — Epic 5 doesn't claim FR coverage but aligns to UX-DRs |

### Context Review: Epics 1-3

#### Epic 1: Authentication & Repository Connection

| Check | Status |
|-------|--------|
| User value | ✓ "A new user can sign in with GitHub, connect their team's BMAD-enabled repository" |
| Independence | ✓ Stands alone |
| Starter template story | ✓ Story 1.1 scaffolds the Nx workspace |
| Database creation | ✓ Story 1.1 creates initial Prisma schema (User model) |
| Forward dependencies | ⚠️ Story 1.3 redirects to Project Map (wired in Epic 2); Story 1.5 defers git-config injection to Epic 3; Story 1.6 defers UI display to Epic 2 — all explicitly documented |
| Story personas | ⚠️ Stories 1.1 ("As a developer"), 1.5 ("As the platform"), 1.9 ("As the platform operator") use non-user personas — acceptable for platform/infra stories |

**No critical violations.** Forward dependencies are explicitly documented and each story delivers value independently.

#### Epic 2: Project Map & Artifact Browser

| Check | Status |
|-------|--------|
| User value | ✓ "A user can see what BMAD work the team has produced and what is in progress" |
| Independence | ✓ Depends only on Epic 1 |
| Database creation | ✓ Story 2.1 creates `Artifact` table when first needed |
| Forward dependencies | ⚠️ Story 2.6 defers "bring open Conversation tab into focus" to Epic 3 — explicitly documented; story delivers value without it |

**No critical violations.**

#### Epic 3: Conversations

| Check | Status |
|-------|--------|
| User value | ✓ "A user can open a Conversation, invoke BMAD Skills via slash command..." |
| Independence | ✓ Depends on Epics 1 & 2 |
| Database creation | ✓ Story 3.1 creates `Conversation` and `Turn` tables when first needed |
| Forward dependencies | ✓ None |
| Prerequisites | ⚠️ Stories 3.11 and 3.12 carry "Prerequisites (deferred items absorbed from prior story reviews)" — technical debt from prior implementation. These are transparent and documented, but indicate that prior stories shipped with known issues |

**No critical violations.** The prerequisite baggage in Stories 3.11/3.12 is transparent and well-documented.

### Quality Findings Summary

#### 🔴 Critical Violations

None.

#### 🟠 Major Issues

1. **Story 5.3, AC 1 — Architecturally significant change disguised as visual drift.** The inline tool/semantic pills AC requires a data model change (how `TOOL_CALL` events are stored and rendered), not just a visual fix. The Dev Notes acknowledge this but the AC reads as a simple visual alignment. **Recommendation:** Either split this AC into its own story with explicit architectural scope, or add a prominent warning at the AC level (not just Dev Notes) that it requires a data model refactor. Cross-check against Story 3.4 and UX-DR5 before implementation.

2. **Story 5.2 — Unresolved design decisions.** The Dev Notes flag that two shell findings "may be intentional redesigns rather than drift." Some ACs (Settings text label, nav-link placement) may be invalid if the changes were deliberate. **Recommendation:** Resolve with design/PM before implementation. If the changes were intentional, remove the corresponding ACs. If they were drift, confirm and proceed.

#### 🟡 Minor Concerns

1. **Epic 5 framing.** The epic is structured as technical debt remediation ("Close Visual Drift") rather than user value delivery. Visual polish IS user value for a tool targeting non-dev users, but the epic's title and description are implementation-centric. The stories mitigate this with user-centric openings.

2. **Story 5.4 persona.** Uses "As a developer maintaining the design system" — honest but deviates from target user personas. Acceptable for a technical debt story.

3. **ACs reference external investigation file.** Epic 5's ACs heavily reference `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` with specific line numbers. While good for traceability, the ACs are not fully self-contained — they require reading the investigation to understand the full context. The investigation file should be verified to still exist and be current at implementation time.

4. **Epic 4 reserved.** Epic 4 is "reserved and intentionally unused." This is noted and harmless, but creates a gap in epic numbering. No action needed.

5. **Stories 3.11/3.12 prerequisites.** These stories carry deferred technical debt from prior story reviews. While transparent and well-documented, they indicate that prior stories shipped with known issues that were deferred rather than fixed inline. This is a process observation, not a structural defect.

## Summary and Recommendations

### Overall Readiness Status

**READY WITH CONDITIONS**

The planning artifacts for bmad-easy are in excellent shape. The PRD is approved, FR/NFR coverage is 100% (19/19 FRs, 12/13 NFRs with 1 explicitly deferred), UX documentation is complete and aligned with both PRD and Architecture, and the architecture fully supports all UX and PRD requirements. Epic 5 (the target epic) is well-structured with clear, traceable acceptance criteria referencing specific investigation findings.

Two major issues in Stories 5.2 and 5.3 should be resolved before those specific stories are implemented. Stories 5.1 and 5.4 can proceed immediately without any blockers.

### Critical Issues Requiring Immediate Action

1. **Story 5.3, AC 1 — Architectural change disguised as visual drift.** The inline tool/semantic pills AC requires changing how `TOOL_CALL` events are stored and rendered (from standalone rows to position-interleaved within the agent's markdown stream). This is a data model change, not a visual fix. **Action:** Before implementing Story 5.3, either (a) split this AC into its own story with explicit architectural scope and a cross-check against Story 3.4 / UX-DR5, or (b) add a prominent warning at the AC level that it requires a data model refactor. The Dev Notes mention this but the AC itself reads as a simple visual alignment.

2. **Story 5.2 — Unresolved design decisions.** The Dev Notes flag that two shell findings (nav-link placement, Settings text label) "may be intentional redesigns rather than drift." Some ACs may be invalid if the shell layout was deliberately changed from the mockup. **Action:** Confirm with design/PM whether the shell layout was deliberately changed before implementing Story 5.2. If intentional, remove the corresponding ACs. If drift, confirm and proceed.

### Recommended Next Steps

1. **Resolve Story 5.2 design decisions** — Confirm with design/PM whether the nav-link placement and Settings-label removal were intentional redesigns or drift. Update the ACs accordingly before implementation.

2. **Scope Story 5.3's inline pills AC** — Cross-check against Story 3.4 and UX-DR5. Determine whether the data model change (TOOL_CALL events interleaved in markdown stream vs. standalone rows) should be a separate story. If kept in Story 5.3, elevate the warning from Dev Notes to AC level.

3. **Verify investigation file currency** — Epic 5's ACs reference `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` with specific line numbers. Verify this file still exists and is current before implementation, as the ACs depend on its findings.

4. **Begin with Stories 5.1 and 5.4** — These stories have no blockers and can proceed immediately. Story 5.1 (missing visual containers) and Story 5.4 (token-usage drift and config gaps) are self-contained and well-specified.

5. **Stage Story 5.4's `theme.extend` → `theme` override carefully** — Follow the Dev Notes guidance: grep for default-palette utilities first, migrate real uses to design-system tokens, then switch to full overrides. This prevents regressions.

### Assessment Statistics

| Category | Count |
|----------|-------|
| Total FRs in PRD | 19 |
| FRs covered in epics | 19 (100%) |
| Total NFRs in PRD | 13 |
| NFRs covered in epics | 12 (92%; 1 explicitly deferred to post-MVP) |
| UX design requirements (UX-DRs) | 20 |
| UX-DRs mapped to epics | 20 (100%) |
| Critical violations | 0 |
| Major issues | 2 |
| Minor concerns | 5 |

### Final Note

This assessment identified **7 issues** across **3 severity categories** (0 critical, 2 major, 5 minor). The planning artifacts are thorough, well-structured, and internally consistent. The PRD is approved. FR and NFR coverage is complete. UX documentation is aligned with both PRD and Architecture. Architecture supports all UX and PRD requirements.

The 2 major issues are both in Epic 5 and both are resolvable before implementation of their respective stories — neither blocks the epic as a whole. Stories 5.1 and 5.4 are ready to implement immediately.

**Assessor:** Implementation Readiness Reviewer (automated)
**Date:** 2026-07-11
**Target:** Epic 5 — UX Mockup Fidelity — Close Visual Drift
