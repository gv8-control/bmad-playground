---
name: bmad-easy
status: draft
created: 2026-06-14
updated: 2026-06-14
sources:
  - _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md
---

# bmad-easy — Experience Spine

## Foundation

Single-surface responsive web. shadcn/ui on Next.js + Tailwind CSS. `DESIGN.md` is the visual identity reference. Page-based navigation with stable URLs; no SPA tab bar in the application chrome. The Project Map is the root surface; Skill Session and Artifact Browser are one level down with a single breadcrumb back to the Project Map.

Primary form-factor: desktop/laptop browser at `lg` (1024px+). Tablet supported at `md` (768px). Mobile-phone viewport (below `md`) adapts but is not a design target for MVP.

Users span developer champions (evaluating the platform for their team, comfortable with git concepts) and non-dev primary users (PMs, BAs, Delivery Leads with no CLI or git experience). The UI must not assume technical knowledge, and must not patronize experienced users. Plain, direct language throughout; no "beginner mode."

## Information Architecture

| Surface | URL Pattern | Reached from | Purpose |
|---|---|---|---|
| Auth | `/login`, `/signup` | Direct navigation / unauthenticated redirect | Sign in or create account (GitHub OAuth primary, email/password fallback) |
| Onboarding | `/onboarding` | Post-signup; or post-login with no repo connected | Connect GitHub repository URL + PAT; validate BMAD setup |
| Project Map | `/` | Post-onboarding; top-nav home link | Home — artifact list, Skill Session launch entry |
| Skill Session | `/sessions/:id` | Project Map Skill Launch Field | Chat with BMAD Agent; Commit Pills; session state |
| Artifact Browser | `/artifacts/:path*` | Project Map artifact row; Commit Pill "View" action | Read-only rendered Markdown view of a committed artifact |
| Paywall | `/upgrade` | Trial expiry enforcement; seat limit enforcement | Purchase prompt — no platform features accessible until resolved |

Breadcrumb depth: one level. Session and Artifact Browser pages show "← Project Map." Auth, Onboarding, and Paywall show no breadcrumb. Each page title reflects its content (per PRD FR-11): session pages show the Skill name (with "(expired)" suffix when ended); the Project Map shows the project name; the Artifact Browser shows the artifact title.

Concurrent Skill Sessions are separate browser tabs at their own stable URLs. There is no in-app tab management UI.

→ Composition reference: `.working/onboarding.html`, `.working/project-map.html`, `.working/skill-session.html`, `.working/artifact-browser.html`. Spine wins on conflict.

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md`.

| Do | Don't |
|---|---|
| "Connect your repository" | "Link your GitHub account to get started! 🚀" |
| "Starting session…" | "Warming up your AI assistant…" |
| "/bmad-prd committed. View artifact →" | "Great news! Your document has been saved to Git!" |
| "This token doesn't have `contents:write` access to this repository." | "Something went wrong. Please try again." |
| "Session expired. Committed artifacts are preserved." | "Oops! Your session timed out." |
| "No artifacts yet. Start your first session with `/`." | "Looks like you're new here! Click below to begin your journey." |
| Skill names always in Geist Mono with slash prefix: `/bmad-prd` | "PRD skill" (no slash, no mono) |
| "Session limit reached (10/10). Close an existing session to start a new one." | Silent failure or generic "error" |
| Error messages name the specific problem | Vague errors that require the user to guess what to fix |

The platform speaks to PMs the same way it speaks to developer champions. No "non-technical" register. Short, direct, actionable.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Surface | Behavioral rules |
|---|---|---|
| Skill Launch Field | Project Map | Typing `/` activates the filterable Skill dropdown (shadcn `Command` in a `Popover`). Filtering narrows the list by Skill name. Selecting a Skill navigates to a new Skill Session page. `Esc` clears the field and closes the dropdown. Clicking outside closes the dropdown but preserves the typed text. Skills are sourced from the connected repository's `_bmad/skills/` directory. |
| Artifact Row | Project Map | Click on a completed artifact → Artifact Browser. Click on an in-progress artifact whose session page is open in another browser tab → that session URL (browser navigates there). Click on an in-progress artifact with no active session → Artifact Browser (read-only). The artifact's in-progress state is derived from active platform session state; it does not require a git read. |
| Manual Refresh | Project Map | Button in the page header. Re-reads `_bmad-output/` from the repository. Shows a spinner during the read. Does not navigate away. Does not interrupt Skill Sessions (they are on separate pages). |
| Chat Bubble — Agent | Skill Session | Markdown rendered as tokens stream. Code blocks show a per-block copy button (always visible). Message-level copy appears on hover. Inline Commit Pills appear as standalone elements between message bubbles at the commit event position — they are not nested inside a bubble. Timestamp shown inline at muted prominence; messages under 1 minute old show "just now," older messages show wall-clock time. |
| Chat Bubble — User | Skill Session | Timestamp shown on hover, right-aligned below the bubble. Messages under 1 minute old show "just now," older messages show wall-clock time. |
| Commit Pill | Skill Session | Appears inline in the chat stream at the exact position of the commit event. Two variants: *agent-initiated* (solid ember border, artifact type + name + "View →" link) and *platform checkpoint* (dashed ember border, "Platform checkpoint" source badge + ISO timestamp, no "View →"). Both are persistent parts of the chat history and remain visible on reconnect. Multiple commits in a single session produce separate Pills at their respective positions. DESIGN.md frontmatter entries: `commit-pill` (agent-initiated) and `commit-pill-checkpoint` (platform checkpoint). |
| Agent Thinking Indicator | Skill Session | Visible while the LLM is generating with no tokens yet streamed. Replaced immediately by the first streamed token — never shown simultaneously with streaming content. |
| Agent Tool Indicator | Skill Session | Visible while a tool or Bash command executes in the Sandbox. Distinct from the Thinking Indicator: it is a chip showing the tool/command name (Geist Mono, truncated at 40 chars), not a dot animation. Can appear mid-stream if the agent pauses to run a tool. Collapsed chip collapses further to a completed state when the tool run finishes. Expandable to show stdout/stderr output (collapsed by default; clicking the chip expands it). |
| Stop Button | Skill Session | Visible any time the agent is processing (thinking or running a tool). Activating Stop terminates the in-flight LLM response and any tool/Bash process running in the Sandbox. Does not terminate the Sandbox. After Stop, the chat input is re-enabled immediately; the user can send a new message in the same session. |
| Scroll-to-Bottom Button | Skill Session (chat area) | Appears when the user has scrolled above the latest message. Hidden when chat is at the bottom. Chat auto-scrolls during streaming unless the user has manually scrolled up. |
| Draft Persistence | Skill Session (chat input) | Unsent draft saved to `localStorage` keyed by session ID. Restored on reconnect within the idle timeout. Cleared on successful send. |
| Working Tree State Indicator | Skill Session (chat input area) | Persistent status element showing working tree state. Dirty: `● Unsaved changes` in ember; clean: `✓ All saved` in muted foreground (or hidden). Polling via `git status --porcelain` every 15 s while session is active; polling suspended during an active agent turn. Resets to clean immediately on any Commit Pill event (agent-initiated or platform) — no wait for the next poll cycle. Hidden while Sandbox is provisioning and after session expires. When dirty, element is activatable (cursor-pointer); activating it opens the Save Checkpoint confirmation. Pulses once in ember when the agent completes a response turn and the working tree is dirty; pulse does not repeat until the next agent turn completes. |
| Save Checkpoint | Skill Session (chat input area) | Triggered by activating the Working Tree State Indicator when dirty. Presents an inline confirmation labeled "Save checkpoint" — no git vocabulary. On confirm: queued behind an agent-idle lock (user receives immediate visual acknowledgment; exec fires when agent is next idle). Platform executes `git add -A && git commit --no-verify` via Daytona exec API (bypasses the BMAD Agent). On success: a platform-checkpoint Commit Pill appears inline at the save-event position and the indicator resets to clean. On failure: visible inline error in the chat area; indicator remains dirty. Indicator and confirm button are disabled while a save is in progress (prevents duplicate submissions). If the working tree is clean when activated, the operation returns a no-op without error. |
| Credential Warning Banner | Project Map | Shown when credential health status is `failed`. Full-width below top nav. Persists until a new PAT is successfully validated. CTA opens the PAT update flow inline — no full-page redirect. Not dismissible by the user while credentials remain invalid. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Unauthenticated access | Any | Redirect to `/login`. |
| No repository connected | Post-auth | Redirect to `/onboarding`. |
| `_bmad/` missing from repository | Onboarding step 2 | Blocking inline error: named prerequisite + link to BMAD documentation. "Connect" button disabled. Cannot proceed. |
| Validating PAT + repository | Onboarding step 2 | shadcn `Skeleton` rows + spinner on Connect button. Button disabled until validation completes. Clears to either success (redirect to Project Map) or failure (inline field error). |
| PAT invalid or wrong scope | Onboarding step 2 | Specific inline error on the PAT field describing the exact failure: invalid token / missing `contents:write` permission / no access to the specified repository. User re-pastes without leaving the step. |
| PAT valid, repository confirmed | Onboarding | Redirect to Project Map immediately. No intermediate confirmation screen. |
| Empty Project Map (no `_bmad-output/` content) | Project Map | Geist Sans centered text: "No artifacts yet." Subtext: "Start your first skill session — type `/` to choose a skill." Skill Launch Field is the primary action. |
| Sandbox provisioning | Skill Session | Full-width status bar at top of chat area: "Starting session…" with shadcn spinner. Chat input disabled (`aria-disabled`). Chat area visible with a single Skeleton row. Resolves within 10 s (NFR-P2). |
| Sandbox ready | Skill Session | Status bar transitions to the active session indicator (pulsing dot + Skill name). The BMAD Agent sends its opening message automatically. Chat input enabled. |
| Agent streaming | Skill Session | Tokens render progressively. Thinking Indicator hidden. Tool Indicator shown if a tool run begins mid-stream. Stop button visible. Chat auto-scrolls unless user has manually scrolled up. |
| Working tree dirty | Skill Session | Indicator shows `● Unsaved changes` (ember). Element is activatable. No automatic action taken. |
| Working tree clean | Skill Session | Indicator shows `✓ All saved` (muted foreground) or is hidden. Not activatable. |
| Checkpoint in progress | Skill Session | Indicator and Save Checkpoint confirm button both disabled. Inline visual acknowledgment that save is queued. |
| Checkpoint success | Skill Session | Platform-checkpoint Commit Pill emitted inline at the save-event position. Indicator resets to clean immediately. |
| Checkpoint failure | Skill Session | Inline error in the chat area below the input. Indicator remains dirty. No partial commit state created. |
| Session approaching idle timeout | Skill Session | At 25 minutes of inactivity (5 minutes before the 30-minute Sandbox pause threshold), **only if the working tree is dirty**: a system message appears inline in the chat timeline — "Session may pause in 5 minutes. Uncommitted changes will be lost." — with an inline "Save now" action that triggers the same Save Checkpoint flow. The system message appears at most once per idle window and is not repeated if the user acts on it or the session becomes active again. If the working tree is clean, no message is shown. |
| Session expired | Skill Session | Status bar: "Session expired. Committed artifacts are preserved." Chat history readable. Chat input replaced by: "Start a new `/[skill-name]` session →" (Skill name in Geist Mono). Page title updated: "[Skill name] (expired)." |
| Concurrent session limit reached (10) | Project Map (skill entry) | Inline message below the Skill Launch Field: "Session limit reached (10/10). Close an existing session to start a new one." Persistent, not a toast — the user needs to act before it resolves. |
| Seat limit exceeded | Project Map (skill entry) | Same area as session limit: clear upgrade prompt with a link to `/upgrade`. |
| Trial expired | Post-login | Redirect to `/upgrade`. No platform features accessible. |
| Credential health failed | Project Map | Credential Warning Banner. Background reads stop until resolved. |
| Artifact loading | Artifact Browser | shadcn `Skeleton` rows (4–6) matching expected Markdown heading and paragraph structure. Resolves within 2 s (NFR-P4). |
| Artifact load failure | Artifact Browser | Muted inline error in place of content: "This artifact could not be loaded." Includes "← Project Map" link. No retry affordance. |
| Project Map loading | Project Map | shadcn `Skeleton` rows (3–5) in the artifact list area. Resolves within 2 s (NFR-P3). |
| Offline | Global | shadcn `Toast` once (not repeated): "You're offline. The platform will reconnect when your network is available." Active streaming stops; chat history and Project Map remain readable from state already loaded. No auto-retry banners. |

## Interaction Primitives

**Keyboard.** bmad-easy's primary users are PMs without power-user keyboard habits; developer champions are present but secondary. Keyboard interactions are predictable and standard — no vim-style navigation.

- `/` typed in the Skill Launch Field — activates the Skill dropdown (natural slash-command convention; users who have seen Claude Code or similar tools recognize this immediately)
- `Esc` in the Skill Launch Field — clears field, closes dropdown
- `Enter` in chat input — sends message
- `Shift+Enter` in chat input — inserts newline without sending
- `Esc` in any dialog or `Sheet` — closes (shadcn default)
- `Tab` order — matches visual reading order on every surface

No global keyboard shortcuts beyond the above. Keep interactions standard and discoverable.

**Chat input.** Multi-line auto-growing `textarea`. Grows vertically as the user types; capped at 200px before internal scroll. A "Send" button is present as a secondary affordance alongside `Enter` to submit. The `Enter`-to-submit convention must be explicitly noted in placeholder text: "Message… (Enter to send, Shift+Enter for new line)."

**Banned interactions:** drag-to-reorder (no lists require ordering in MVP), infinite scroll (Project Map paginates at 50 artifacts per page), hover-only affordances on touch viewports.

## Accessibility Floor

Behavioral. Visual contrast ratios are documented in `DESIGN.md` Colors (contrast table). Summary: indigo primary (#2C42DB) meets WCAG AA and AAA for all text sizes against white. Ember accent (#EA5C1E) meets AA for large text (≥ 18px) only and must not appear as small normal-weight body text — its roles here (Commit Pill border, session pulse dot, interactive Working Tree label) are non-text signals or bold interactive text at the margin.

- WCAG 2.2 AA across the full web surface.
- Screen reader announces surface on navigation: "Project Map — [project name]" / "Skill Session — /bmad-prd, active" / "Artifact Browser — [artifact title], read-only."
- `aria-live="polite"` on the chat message list — new agent messages announced as they complete streaming (not token-by-token, which would be disruptive).
- `aria-busy="true"` on the chat input and `aria-disabled="true"` while the agent is processing.
- `aria-label` on the Stop button: "Stop agent response."
- Commit Pill announces: "Artifact committed: [type] — [title]. View button available."
- Agent Tool Indicator announces its expanded/collapsed state on toggle via `aria-expanded`.
- `aria-live="polite"` on the sandbox provisioning status bar so screen readers hear "Starting session…" and the subsequent "Session ready" transition.
- Session expired state announces via `aria-live`: "Session expired. Committed artifacts are preserved."
- Credential Warning Banner announced immediately on appearance via `aria-live="assertive"`.
- `Tab` order on the Project Map: top nav → Skill Launch Field → artifact rows (top to bottom) → Manual Refresh button.
- Focus rings inherit shadcn's `ring` token; `{colors.primary}` ring on custom brand components.
- All interactive elements reachable and operable by keyboard alone.

## Responsive & Platform

| Breakpoint | Layout behavior |
|---|---|
| `≥ lg` (1024px+) | Sidebar nav visible. Session page: `max-w-4xl` chat column. Project Map and Artifact Browser: `max-w-2xl` centered. |
| `md` (768–1023px) | Sidebar collapses to icon rail. Chat column fills available width. |
| `< md` (below 768px) | Sidebar becomes off-canvas `Sheet` from top bar trigger. Chat input pinned to bottom of viewport. Full-width layout throughout. Functional but not a design target. |

bmad-easy is a browser-only web application. No PWA, no native mobile app, no desktop wrapper for MVP.

## Key Flows

Flow-to-UJ mapping: Flow 1 = PRD UJ-1, Flow 2 = PRD UJ-2, Flow 3 = PRD UJ-3. Flow 4 and Flow 5 are supplementary platform-level journeys with no direct PRD UJ mapping.

### Flow 1 — UJ-1: Repository connection (Sarah, PM, first session)

**Persona:** Sarah is a PM at a 40-person SaaS company. Her developer colleague has BMAD set up in the shared repo and sent her a bmad-easy invite link. She has a GitHub account but has never touched a terminal.

1. Sarah arrives at `/signup`. GitHub OAuth button is the primary CTA. She clicks it; GitHub prompts permission; she approves. She is redirected to `/onboarding`.
2. **Step 1 — Repository URL.** Sarah sees a single input: "GitHub repository URL." Below it: "You'll need a fine-grained GitHub PAT — [generate one for this repository →]" (links to GitHub documentation, opens in a new tab). She pastes the repository URL.
3. **Step 2 — PAT entry.** Sarah returns from GitHub, pastes the generated PAT, and clicks "Connect." A brief shadcn `Skeleton` state (≤ 2 s). The platform validates the PAT and confirms `_bmad/` is present.
4. **Climax:** Sarah is redirected to the Project Map. The list shows two artifacts her developer ran weeks ago — a brainstorming session and a draft brief. She sees the team's BMAD state at a glance, without opening GitHub.
5. **Resolution:** Sarah is on the Project Map, Skill Launch Field in focus, ready to start her first session.

Failure — PAT invalid: Inline field error immediately below the PAT input: "This token doesn't have `contents:write` access to this repository." Sarah re-pastes without leaving the step; no page reload.

Failure — `_bmad/` absent: Blocking message replaces Step 2: "This repository hasn't set up BMAD yet. A developer needs to initialize it first. [Learn how →]." Connect button remains disabled.

---

### Flow 2 — UJ-2: Skill Session and Commit Pill (Sarah, running /bmad-prd)

**Persona:** Sarah is on the Project Map with her repository connected.

1. Sarah types `/bm` in the Skill Launch Field. A dropdown appears: `/bmad-prd` at the top. She presses `Enter` (or clicks it).
2. Browser navigates to `/sessions/[id]`. The status bar shows "Starting session…" with a spinner. The chat area is visible with a Skeleton row.
3. Within 10 seconds, the status bar transitions to the active state: pulsing indigo dot + `/bmad-prd` in Geist Mono. The BMAD PM agent sends its opening intake message.
4. Sarah and the agent converse across multiple turns over ~20 minutes. The agent asks clarifying questions; Sarah provides context. She sees the agent thinking indicator between her messages, and a tool indicator chip briefly when the agent runs internal commands.
5. **Climax:** The agent finishes the PRD and commits it. Inline in the chat stream, between two agent messages, a Commit Pill appears: `[git-commit icon] PRD: bmad-easy  committed.  View →`. Sarah clicks "View →."
6. The Artifact Browser opens at `/artifacts/_bmad-output/planning-artifacts/prds/…`. The PRD renders as clean Markdown. Sarah is listed as the git author.
7. **Resolution:** Sarah clicks the breadcrumb "← Project Map." The PRD now appears in the artifact list with the in-progress accent replaced by the completed state.

---

### Flow 3 — UJ-3: Reading a teammate's artifact (Sarah, pre-meeting)

**Persona:** Sarah's developer teammate committed an architecture document through local Claude Code. Sarah wants to read it before a planning meeting.

1. Sarah is on the Project Map. She sees "Architecture: bmad-easy" listed as a completed artifact.
2. She clicks the row. Browser navigates to the Artifact Browser.
3. **Climax:** The architecture document renders — headings, tables, code blocks — in a clean reading layout. No GitHub file navigation, no raw Markdown text, no IDE required.
4. **Resolution:** Sarah reads the document, uses the browser back button, and is back on the Project Map.

Failure — artifact not found or read error: Muted inline error replaces the rendered content: "This artifact could not be loaded." Link: "← Project Map." No retry affordance.

---

### Flow 4: Session expiry recovery (Sarah, returning after a pause)

**Persona:** Sarah started a `/bmad-brainstorming` session in the morning, ran 3 turns, and left for a 2-hour meeting.

1. Sarah returns and opens the session tab. The status bar shows "Session expired. Committed artifacts are preserved."
2. The full chat history from before the break is visible and readable.
3. The chat input area shows: "Start a new `/bmad-brainstorming` session →" (Skill name in Geist Mono). There is no committed artifact from this session — she hadn't got far enough.
4. **Climax:** Sarah clicks the link. A new Skill Session for `/bmad-brainstorming` opens. She copies the context she typed earlier from the old session and pastes it into the new one.
5. **Resolution:** Sarah is back in a live session. The workflow continues; the old expired session tab remains readable as a reference.

Failure — session limit reached: If 10 active sessions exist when Sarah clicks the new session link, the link is replaced by an inline message: "Session limit reached (10/10). Close an existing session to start a new one."

---

### Flow 5: Save Checkpoint (Sarah, active session with a dirty working tree)

**Persona:** Sarah is mid-session in `/bmad-prd`. The agent has executed tool calls that modified working files but hasn't committed a formal artifact yet. She needs to step away for 10 minutes.

1. Sarah notices `● Unsaved changes` in ember in the chat input area. She clicks it.
2. A confirmation appears: "Save checkpoint — Commits current working tree state to git. The agent does not participate in this commit." Confirm button: "Save checkpoint." Cancel button: "Cancel."
3. Sarah clicks "Save checkpoint." The Working Tree State Indicator disables and shows a queued acknowledgment. The platform executes `git add -A && git commit --no-verify` in the Sandbox (bypasses the BMAD Agent).
4. **Climax:** A platform-checkpoint Commit Pill appears inline in the chat stream at the save-event position: `[checkpoint icon] Platform checkpoint  2026-06-14T14:32:00Z`. The Working Tree State Indicator resets to `✓ All saved`.
5. **Resolution:** Sarah steps away. The checkpoint preserves all in-progress working tree changes. On return, if the session has expired (Flow 4 recovery applies), the checkpoint Commit Pill remains visible in the chat history as a reference point.

Failure — save in progress: Confirm button is disabled while a save is executing. Visual acknowledgment is shown. No duplicate submission is possible.
