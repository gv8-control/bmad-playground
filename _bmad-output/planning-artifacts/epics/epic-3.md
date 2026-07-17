# Epic 3: Conversations — Running BMAD Skills with the Agent

A user can open a Conversation, invoke BMAD Skills via slash command, converse with the streaming Agent across multiple turns, see Tool Pills and Semantic Pills for agent actions, track the working tree state, and manually save progress — with the Agent's committed output flowing into the Artifact Browser and Project Map built in Epic 2.

## Story 3.1: Provision a Sandbox When Opening a Conversation

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

## Story 3.2: Invoke BMAD Skills via Slash Command

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

## Story 3.3: Converse with the Streaming Agent

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

## Story 3.4: See Tool Calls and Recognized Actions Inline

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

## Story 3.5: Resume an Existing Conversation

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

## Story 3.6: Track and Manually Save Working Tree State

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

## Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation

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

## Story 3.8: Track Per-User LLM Spend

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

## Story 3.9: Terminate Idle Sandboxes Mid-Conversation

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

## Story 3.10: Verify Commits Carry the User's Own Identity

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

## Story 3.11: Run Concurrent Conversations

As a user juggling multiple BMAD workflows,
I want to have several Conversations active at once,
So that I'm not blocked working through one Skill at a time.

**Prerequisites:**

- **Concurrent-turn guard:** `circuitBreakerTimers` orphaned by concurrent `runTurn` calls on same `conversationId` — no guard against concurrent invocation; second call overwrites first's `activeRuns` and `circuitBreakerTimers` entries, orphaning the first run. [`apps/agent-be/src/streaming/agent.service.ts:runTurn`]
- **handleRetry leak:** `handleRetry` mints a new conversation on every click when `initialConversationId` is undefined — previous in-flight provisioning not cancelled; leaks Daytona sandboxes and DB rows. [`apps/web/src/components/conversation/ConversationPane.tsx:275`]

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

## Story 3.12: Drain Conversations Gracefully on Deploy

As a user with an active Conversation when the platform deploys a new version,
I want my connection to end cleanly and let me reconnect without losing history,
So that routine deploys never look like a crash or lose my work.

**Prerequisites:**

- **In-memory sandbox state, no recovery on restart:** `sandboxStatuses` and `sandboxIds` are in-memory `Map`s, never persisted to DB. Server restart loses all sandbox state — `getStatus` reports `'provisioning'` (fallback) for conversations whose sandboxes are ready or dead. Sandboxes orphaned in Daytona with no record to destroy. Graceful drain requires knowing what's running; this must be persisted to Postgres. [`apps/agent-be/src/conversations/conversations.service.ts`]
- **ManualCommitService.onModuleDestroy drops pending commits:** `onModuleDestroy` silently drops pending commits without emitting `MANUAL_SAVE_FAILED`. The spec said "clear pending commits on shutdown," but draining must either complete or notify — silent drop loses work. [`apps/agent-be/src/conversations/manual-commit.service.ts:91-93`]
- **Dependency (confirm resolved, not fixed here):** `SandboxService.resume` returns `conversationId: sandboxId` — conflates sandbox ID with conversation ID. This story's "clients can reconnect and resume" AC depends on resume returning the correct conversationId. Verify 3-5 resolved it; if not, resolve as part of this story. [`apps/agent-be/src/sandbox/sandbox.service.ts:64`]

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
