# Sprint Change Proposal: Live-Usage UX Improvements

**Date:** 2026-07-13
**Trigger:** Post-launch usage of bmad-easy discovered five UX gaps in the shipped application
**Scope Classification:** Moderate (new epic + UX spec reconciliation, no PRD goal changes)
**Status:** Approved
**Mode:** Batch (unattended) — assumptions documented in §Assumptions

---

## Section 1: Issue Summary

### Problem Statement

After Epic 5 closed (including its retrospective — `sprint-status.yaml` marks `epic-5` and `epic-5-retrospective` as `done`), live usage of the shipped application surfaced five independent UX gaps that the mockup-vs-implementation drift audit did not catch — because these are not mockup drift. They are genuine live-usage findings about states and feedback that the design never fully specified (loading feedback during in-app navigation, relative timestamps beyond one minute, prominence of focus rings on navigation surfaces) and about inconsistency in how already-specified patterns render (error presentation in the conversation view).

Epic 5's theme was explicitly "close visual drift between mockups and implementation" (epics.md line 230-231). These five stories are a different category — **live-usage UX improvements** — which is why they were invisible to a mockup-fidelity audit and why reopening Epic 5 is the wrong vehicle for them.

### Evidence

The five findings are concrete and surface-specific:

| # | Story | Surface | Evidence |
|---|-------|---------|---------|
| A | Unify error states in conversation view | Conversation | The sandbox-setup error ("Failed to set up the sandbox. Please try again or contact support.") with its Retry button renders detached from the conversation flow, while the Claude Code error and the new-conversation greeting render inline. Two error surfaces, two placements. |
| B | Loading state for sidebar page nav | App shell / sidebar | Switching between pages via the sidebar nav gives no feedback that a transition is in progress. |
| C | Loading state for artifact switching | Artifact Browser | Clicking a second artifact while one is open shows no loading feedback. |
| D | Reduce focus state prominence on nav surfaces | Sidebar, Project Map, Artifact Browser | Focus rings create visual noise on navigation surfaces. The chat input's focus state is correct and stays. |
| E | Relative time for conversation timestamps | Conversation messages | Timestamps display absolute time prominently; relative time ("3 minutes ago") would be more useful for recency. |

### Consequences

- Stories A and D are **consistency/polish** issues that make the app feel unfinished on the conversation and navigation surfaces.
- Stories B and C are **perceived-performance** issues — the app appears frozen during transitions that take perceptible time, eroding trust.
- Story E is a **usability** issue — absolute timestamps for recent activity force the user to do mental arithmetic against the current clock.

None of these blocks the MVP thesis (the application is functional and shipped), but together they represent the kind of rough edges that undermine the "calm, professional, polished" positioning the design system was built to convey (DESIGN.md §Brand & Style).

---

## Section 2: Impact Analysis

### Epic Impact

**Epic 5 (UX Mockup Fidelity — Close Visual Drift)** contains the closest related work but is **done, including its retrospective** (`sprint-status.yaml` lines 86-92). Reopening a closed-and-retrospected epic conflates two categories that the project has already distinguished:

- Epic 5 = "the mockups are authoritative; the code aligns to them" (epics.md line 931).
- These five stories = "the mockups/specs under-specified live-usage behavior; the specs need to evolve."

Reopening Epic 5 would also retroactively invalidate its retrospective, which is poor change-management hygiene. **Epic 5 must not be reopened.**

**Epic 6 (Sandbox-Based Agent Execution)** is in `backlog` (`sprint-status.yaml` lines 94-103), created by the 2026-07-11 proposal. These five UX stories are **independent of Epic 6** — they are frontend presentation changes with no dependency on where the agent executes. Epic 6 touches `apps/agent-be` execution + sandbox provisioning; none of Stories A-E depend on that. The two epics can run in parallel or be sequenced independently.

**Epic 1–3** are functionally complete (`done`). Two spec-level requirements they delivered are directly modified by this proposal (UX-DR4 and UX-DR16, both delivered in Story 1.8 / Epic 3). No Epic 1-3 **stories** are reopened or re-scoped — the spec requirements they implemented against are updated, and the new Epic 7 stories carry the delta.

| Epic | Status | Impact |
|-------|--------|--------|
| Epic 1 | done | UX-DR16 (delivered in Story 1.8) is refined — see §Artifact Conflicts. No story reopened. |
| Epic 3 | done | UX-DR4 (delivered in Story 3.3) is extended — see §Artifact Conflicts. No story reopened. |
| Epic 5 | done (incl. retrospective) | Not touched. Different category (mockup drift, not live-usage UX). |
| Epic 6 | backlog | No dependency. Can run in parallel. |

### Story Impact

No existing stories are modified or removed. Five new stories are added:

| New Story | Title | Surfaces |
|-----------|-------|----------|
| 7.1 | Unify Error State Presentation in Conversation View | Conversation |
| 7.2 | Loading State for Sidebar Page Navigation | App shell / all sidebar destinations |
| 7.3 | Loading State for Artifact Switching in Artifact Browser | Artifact Browser |
| 7.4 | Reduce Focus State Prominence on Navigation Surfaces | Sidebar, Project Map, Artifact Browser |
| 7.5 | Relative Time for Conversation Timestamps | Conversation messages (user + agent) |

### Artifact Conflicts

| Artifact | Conflict | Action Needed |
|-----------|----------|---------------|
| **PRD** (`prd.md` §4 FR-10, line 265) | Story E directly contradicts the PRD's explicit timestamp rule: *"Messages sent within the most recent minute show a relative label (e.g. 'just now'); older messages show the wall-clock time."* Story E makes older messages show relative time too. | **PRD update required** — extend FR-10's timestamp behavior to relative time for the broader recency window, with absolute time demoted to hover. (See §4.5.) |
| **Epics** (`epics.md` UX-DR4, line 141) | Story E extends relative time beyond the current "just now under 1 minute" rule. | **UX-DR4 update required** — specify relative-time rules for all recency thresholds. (See §4.3.) |
| **Epics** (`epics.md` UX-DR16, line 165) | Story D conflicts with *"visible 2px accent focus rings with 2px offset on all interactive elements (never suppressed on click)."* | **UX-DR16 update required** — add a navigation-surfaces exception using `:focus-visible`. (See §4.3.) |
| **Epics** (`epics.md` UX-DR19, line 171) | Stories B/C cover loading during in-app navigation and artifact switching — UX-DR19 specifies cold-load/loading/empty/error states per surface but does not cover transition loading. | **UX-DR19 amendment** — add transition-loading as a covered pattern. (See §4.3.) |
| **EXPERIENCE.md** (Accessibility Floor, lines 378-381) | Mirrors UX-DR16 ("Focus is not suppressed on click; the focus ring is always visible."). | **EXPERIENCE.md update** — add the navigation-surfaces `:focus-visible` exception, mirroring the UX-DR16 change. Note: the file already contains the `:focus:not(:focus-visible)` browser-default safety net (line 381), so the pattern is precedented in the spec. |
| **EXPERIENCE.md** (Messages → Timestamps, line 377) | Does not yet encode the relative-time rules (only placement: hover-only on user, inline low-prominence on agent). | **EXPERIENCE.md update** — add the threshold-based relative-time rules, mirroring UX-DR4. |
| **DESIGN.md** (Messages → Timestamps, line 377) | Mirrors the placement rules (hover-only / inline) with no relative-time rules. | **DESIGN.md update** — add the relative-time threshold table. No token changes (uses existing `xs`/`text-2`). |
| **Architecture** (`architecture.md`) | None. All five stories are frontend presentation changes. The architecture touches `apps/agent-be` execution, data models, and infra — none of which these stories affect. | None. |
| **PRD §6.2 (post-MVP list, line 430)** | *"In-app async completion badge when switching pages during a long session (post-MVP)"* — could be misread as conflicting with Stories B/C. | **No conflict** (clarification only). The post-MVP item is about notifying the user that a long-running background operation completed *after* they navigated away. Stories B/C are about transient loading feedback *during* a navigation transition. Distinct concerns — flagged here so a reader does not conflate them. (See §Assumptions.) |
| **sprint-status.yaml** | No Epic 7 entries. | **Add Epic 7** with five stories in `backlog`. (See §4.6.) |
| **project-context.md** | Documents the `focus:ring-2 ...` canonical pattern and `loading.tsx` convention. | **Post-implementation update** — document the nav-surface `:focus-visible` variant once Story 7.4 ships. Not blocking. |

### Technical Impact

- **Code:** Frontend-only. Stories 7.1-7.4 are component/CSS changes in `apps/web`. Story 7.5 adds a relative-time formatter + a client-side tick interval for live updates. No backend, data model, schema migration, or API contract changes.
- **Infrastructure:** None.
- **Deployment:** None.
- **Testing:** Story 7.4 may require updating existing focus-state tests (the codebase uses `focus:` Tailwind variants on nav items — per project-context.md the canonical ring is `focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`; nav surfaces move to `focus-visible:` variants). Story 7.5's live-updating interval needs a timer-based test. Stories 7.2/7.3 should add a transition-loading assertion.

---

## Section 3: Recommended Approach

### Selected: Direct Adjustment — New Epic 7 (Live-Usage UX Improvements)

Add Epic 7 with five stories to the sprint plan and apply the UX spec reconciliations. **Do not reopen Epic 5.** Do not rollback any completed work (these are net-new improvements, not corrections of broken work).

### Rationale

1. **Category match.** Epic 5's theme is mockup drift closure; its acceptance bar was code-aligns-to-mockup. These five stories ask the spec to evolve based on live usage — the opposite direction (mockup/spec aligns to newly-understood need). Putting them in Epic 5 would have retroactively invalidated Epic 5's "mockups are authoritative" framing and its retrospective.

2. **Epic 5 is closed with a retrospective.** Reopening a done-and-retrospected epic erodes the integrity of the retrospective process — a retrospective documents learnings as a closed chapter, and reopening silently rewrites that history. The correct instrument for "things we learned after the retro" is a new epic, not reopening.

3. **No dependencies on Epic 6.** Epic 6 (sandbox-based agent execution) is a backend architectural migration. These stories are frontend presentation. Sequencing them in their own epic lets them ship independently of — and potentially ahead of — Epic 6, since they are lower-risk and deliver immediate user-visible value while Epic 6 is underway.

4. **No PRD goal changes.** The PRD's MVP is already shipped. The one PRD text change (Story 7.5, FR-10 timestamp wording) refines a presentation detail within an already-shipped feature — it does not change MVP scope, goals, or success metrics. This keeps the change below the "Major" threshold that would require PM/Architect strategic intervention.

5. **Spec reconciliation is contained.** Two UX design requirements (UX-DR4, UX-DR16) and one amendment (UX-DR19) plus their EXPERIENCE.md/DESIGN.md mirrors are updated — all within the existing UX spec artifacts. No architecture, data-model, or infra-spec changes.

### Alternatives Considered and Rejected

**Reopen Epic 5 with Stories 5.6–5.10.** Rejected — conflation of categories (mockup drift vs. live-usage UX) and invalidates the retrospective. Epic 5's principle ("mockups are authoritative; code aligns") would also be false for these stories, where the spec is the thing that needs to change.

**Rollback / revert.** Rejected — nothing is broken. The application works; these are polish and feedback gaps, not defects requiring reversal.

**Fold into Epic 6.** Rejected — Epic 6 is backend execution migration with its own coherent scope. Mixing frontend UX polish into it dilutes both and couples independent timelines.

### Effort, Risk, and Timeline

| Dimension | Assessment |
|------------|------------|
| **Effort** | Medium (5 stories; all frontend; 2-3 spec edits) |
| **Risk** | Low — the one deliberation point is Story 7.4's accessibility trade-off (`:focus-visible` on nav surfaces leaves keyboard focus visible per WCAG 2.4.7; mouse-click focus is suppressed). The recommended reconciliation preserves keyboard accessibility. |
| **Timeline** | Sub-sprint; can run in parallel with Epic 6. Recommend sequencing 7.2+7.3 together (shared loading treatment), 7.4 and 7.5 independently, 7.1 first (lowest risk, clearest reference treatment). |
| **MVP impact** | MVP already shipped; no goal/scope change. |

---

## Section 4: Detailed Change Proposals

Grouped by artifact type, per the workflow's Step 3 format (old → new where applicable).

### 4.1 Stories — New Epic 7 added to `epics.md`

Insert Epic 7 (after Epic 5's stories, before any closing matter) with the five stories below. Each story uses the project's established Given/When/Then AC format.

---

#### Story 7.1: Unify Error State Presentation in Conversation View

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

---

#### Story 7.2: Loading State for Sidebar Page Navigation

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
**Then** it uses the shared transition-loading pattern specified in the UX-DR19 amendment (§4.3): existing content dims via opacity with a small spinner, keeping current content visible underneath rather than flashing an empty skeleton

**Given** the sidebar item itself
**When** navigation is triggered from it
**Then** the sidebar item does not render a separate loading indicator — the content-area loading state is the single source of truth for "navigation in progress" (avoids double-signaling; the active state on the destination item already confirms the selection)

**Scope notes:**
- Applies to all sidebar nav destinations (Project Map, Artifact Browser, existing Conversations, Settings, New Conversation).
- Shared visual treatment with Story 7.3 — implement the two together.

---

#### Story 7.3: Loading State for Artifact Switching in Artifact Browser

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

---

#### Story 7.4: Reduce Focus State Prominence on Navigation Surfaces

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

---

#### Story 7.5: Relative Time for Conversation Timestamps

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

---

### 4.2 Story mapping summary

| Trigger letter | New story | Primary spec it touches |
|----------------|-----------|--------------------------|
| A | 7.1 | EXPERIENCE.md Conversation Surface States + UX-DR19 (existing — alignment only) |
| B | 7.2 | UX-DR19 amendment (new transition-loading pattern) |
| C | 7.3 | UX-DR19 amendment (same pattern, applied to artifact switching) |
| D | 7.4 | UX-DR16 + EXPERIENCE.md Accessibility Floor (exception added) |
| E | 7.5 | PRD FR-10 (line 265) + UX-DR4 + EXPERIENCE.md/DESIGN.md Timestamps |

### 4.3 UX Spec updates

#### UX-DR4 (epics.md line 141) — extend relative time

**OLD:**
```
UX-DR4: ... and the specified timestamp display rules (relative "just now" under 1 minute, hover-only on user messages, low-prominence inline on agent messages).
```

**NEW:**
```
UX-DR4: ... and the specified timestamp display rules: relative time as the primary display on both user and agent messages — "just now" under 1 minute, "X minutes ago" 1–59 min, "X hours ago" 1–23 hr, "yesterday"/"X days ago" 24 hr–6 days, absolute date (e.g. "Jul 8") at 7 days and beyond. Absolute time remains accessible via hover but is not prominent. User message timestamps remain hover-only; agent message timestamps remain low-prominence inline. Relative timestamps update live (interval tick) while the conversation view is open. (Extended 2026-07-13 per Story 7.5 — supersedes the prior "just now under 1 minute" only rule; previously older messages showed wall-clock time.)
```

**Rationale:** Story E extends relative time beyond the original 1-minute window. The placement rules (hover-only on user, inline low-prominence on agent) are preserved; only the time format rule broadens.

#### UX-DR16 (epics.md line 165) — add navigation-surfaces exception

**OLD:**
```
UX-DR16: Implement the accessibility floor: visible 2px accent focus rings with 2px offset on all interactive elements (never suppressed on click); ...
```

**NEW:**
```
UX-DR16: Implement the accessibility floor: visible 2px accent focus rings with 2px offset on all interactive elements (never suppressed on click). Exception — navigation surfaces only (sidebar nav items, Project Map artifact cards, Artifact Browser list entries): these use `:focus-visible` so the ring appears on keyboard focus but is suppressed on mouse-click focus. Keyboard focus remains fully visible on every interactive element (WCAG 2.4.7 satisfied). Input and action surfaces (chat input; Run/Retry/Send/Save/Stop buttons; search/filter inputs; tab controls; modal controls; tree/expand-collapse toggles; copy buttons; slash-command picker) retain `:focus` — ring on all focus, never suppressed on click. (Navigation-surface exception added 2026-07-13 per Story 7.4; the existing `:focus:not(:focus-visible)` browser-default safety net in EXPERIENCE.md precedents this pattern.)
```

**Rationale:** Story D's recommended reconciliation. Preserves keyboard accessibility (the WCAG 2.4.7 requirement is "focus visible," which `:focus-visible` satisfies for keyboard users). Removes mouse-click focus noise on navigation surfaces only.

#### UX-DR19 (epics.md line 171) — add transition-loading pattern

**OLD:**
```
UX-DR19: Implement the per-surface loading/empty/error state patterns: Project Map (loading skeleton, empty-state prompt, populated, credential-failed banner, refreshing spinner), Conversation (cold-load skeleton, history-load error with Refresh, "Reconnecting…" with full history visible and disabled input, active/idle), Artifact Browser (list-only, list+detail, loading skeleton, load-error with Refresh, credential-failed banner), Settings (static "coming soon", no states needed).
```

**NEW:**
```
UX-DR19: Implement the per-surface loading/empty/error state patterns: Project Map (loading skeleton, empty-state prompt, populated, credential-failed banner, refreshing spinner), Conversation (cold-load skeleton, history-load error with Refresh, "Reconnecting…" with full history visible and disabled input, active/idle), Artifact Browser (list-only, list+detail, loading skeleton, load-error with Refresh, credential-failed banner), Settings (static "coming soon", no states needed). Transition-loading pattern (added 2026-07-13 per Stories 7.2/7.3): in-app navigation transitions (sidebar page switches) and artifact switching in the Artifact Browser surface a content-pane dim (opacity) + small spinner, with existing content remaining visible underneath, rather than a flash of empty skeleton. This is distinct from cold-load skeletons (which apply on initial page load with no existing content). Consistent visual language across both transition surfaces.
```

**Rationale:** UX-DR19 covered cold-loads and errors but not in-app transition loading. Stories 7.2/7.3 add a distinct transition-loading pattern that keeps existing content visible (dimmed) — better than an empty skeleton flash when switching artifacts.

#### EXPERIENCE.md updates (mirror)

- **Accessibility Floor → Focus management (lines 378-381):** add the navigation-surfaces `:focus-visible` exception, mirroring the UX-DR16 change. The existing line 381 safety net sentence stays.
- **Messages → Timestamps (line 377):** add the threshold-based relative-time rules, mirroring UX-DR4. Placement rules (hover-only user / inline low-prominence agent) are preserved.

#### DESIGN.md update (mirror)

- **Messages → Timestamps (line 377):** add the relative-time threshold table. No token changes (uses existing `xs`/`text-2`). Focus-ring color spec (line 325) unchanged — only the *when-shown* rule for nav surfaces changes, not the ring's appearance.

### 4.4 ARCHITECTURE — no changes

Confirmed by scanning `architecture.md`: it touches `apps/agent-be` execution, data flow, sandbox lifecycle, and infra. None of Stories A-E impact the backend, data models, APIs, or deployment. The only architecture reference to loading is `RefreshButton.tsx` spinner during sync (line 498) — unrelated. **No architecture document updates are required.**

### 4.5 PRD update

**Artifact:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` §4 FR-10 (line 265)

**OLD:**
```
Each message displays a timestamp. Messages sent within the most recent minute show a relative label (e.g. "just now"); older messages show the wall-clock time. Timestamps on user messages are visible on hover; timestamps on agent messages are shown inline at reduced prominence.
```

**NEW:**
```
Each message displays a timestamp as relative time as the primary display: "just now" under 1 minute, "X minutes ago" 1–59 min, "X hours ago" 1–23 hr, "yesterday"/"X days ago" 24 hr–6 days, absolute date (e.g. "Jul 8") at 7 days and beyond. Absolute time remains accessible via hover but is not the prominent display. Timestamps on user messages are visible on hover; timestamps on agent messages are shown inline at reduced prominence. Relative timestamps update live while the conversation view is open. (Updated 2026-07-13 per Story 7.5 — supersedes the prior "relative under 1 minute, wall-clock otherwise" rule.)
```

**Rationale:** The PRD explicitly mandated wall-clock time for older messages; Story 7.5 contradicts this, so the PRD must be updated in lockstep with UX-DR4. This is a presentation refinement within shipped FR-10, not an MVP scope/goal change.

### 4.6 sprint-status.yaml update

**Artifact:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

Append after the Epic 6 block (lines 94-103):

```yaml

  # ── Epic 7: Live-Usage UX Improvements ──
  # Five UX gaps discovered from live-app usage after Epic 5 closed.
  # Frontend presentation changes only; independent of Epic 6.
  # See: sprint-change-proposal-2026-07-13.md
  epic-7: backlog
  7-1-unify-error-state-presentation-in-conversation-view: backlog
  7-2-loading-state-for-sidebar-page-navigation: backlog
  7-3-loading-state-for-artifact-switching-in-artifact-browser: backlog
  7-4-reduce-focus-state-prominence-on-navigation-surfaces: backlog
  7-5-relative-time-for-conversation-timestamps: backlog
```

Also update the top-of-file `last_updated` timestamp to the current UTC datetime on the day this is applied.

### 4.7 Post-implementation (non-blocking)

- `project-context.md` — document the nav-surface `:focus-visible` variant and the relative-time formatter/tick pattern once Stories 7.4 and 7.5 ship. Not a prerequisite for implementation.

---

## Section 5: Implementation Handoff

### Scope Classification: Moderate

Moderate, not Minor, because it requires **UX spec reconciliation** (UX-DR4, UX-DR16, UX-DR19 + their EXPERIENCE.md/DESIGN.md mirrors) and one **PRD text update** (FR-10) alongside five new stories — backlog reorganization with spec/PO coordination, not a pure Developer-only change. It does not rise to Major: no architectural replan, no MVP goal/scope change, no PM/Architect strategic intervention needed beyond sign-off on the accessibility trade-off in Story 7.4.

### Handoff Recipients

| Role | Responsibility | Deliverable |
|------|---------------|-------------|
| **PM (John)** | Approve this proposal; apply the PRD §4 FR-10 timestamp update (§4.5). | Updated PRD line 265. |
| **UX Designer (Sally)** | Approve the UX-DR4 / UX-DR16 / UX-DR19 changes and EXPERIENCE.md/DESIGN.md mirrors (§4.3); confirm the navigation-surfaces list and the "keep visible" list for Story 7.4. | Updated epics.md UX-DRs + EXPERIENCE.md + DESIGN.md. |
| **Developer (Amelia)** | Add Epic 7 + five stories to `epics.md`; add Epic 7 entries to `sprint-status.yaml` (§4.6); implement stories 7.1–7.5 one at a time via `bmad-dev-story`. | New epic, sprint-status entries, working stories. |
| **QA** | Update focus-state tests for the `:focus-visible` variant (Story 7.4); add transition-loading assertions (7.2/7.3); add a live-update timer test (7.5). | Updated/added tests. |

### Recommended Implementation Order

1. **7.1** (error unification) — clearest reference treatment, lowest risk, no spec blocker.
2. **7.2 + 7.3 together** (loading states) — shared treatment, implement jointly per their scope notes.
3. **7.5** (relative time) — standalone; pair with the PRD FR-10 + UX-DR4 spec edits in the same change.
4. **7.4** (focus prominence) — standalone; pair with the UX-DR16 + EXPERIENCE.md Accessibility Floor spec edits; flag the accessibility trade-off in the PR description for explicit review.

### Success Criteria

1. The sandbox-setup error (and all conversation-context errors found in the 7.1 sweep) render inline in the chat-messages panel, matching the new-conversation greeting placement/treatment; Retry is co-located with its error.
2. Every sidebar page switch shows a visible content-area loading state that clears on arrival.
3. Artifact switching shows the dim+spinner loading state with the previous artifact visible underneath until the new one renders.
4. Navigation surfaces (sidebar items, Project Map cards, Artifact Browser entries) suppress the focus ring on mouse click but show it on keyboard (Tab) focus; input/action surfaces show the ring on all focus.
5. Conversation timestamps show relative time as the primary display (agent inline low-prominence; user on hover) and update live; absolute time is accessible on hover; messages ≥7 days show an absolute date.
6. UX-DR4, UX-DR16, UX-DR19 (and EXPERIENCE.md/DESIGN.md mirrors) and PRD FR-10 reflect the new rules.
7. `sprint-status.yaml` contains Epic 7 with five `backlog` stories.

---

## Assumptions

Documented decisions made on the user's behalf in Batch mode (no interactive halts):

1. **Mode = Batch.** The workflow's Step 1 offers Incremental vs. Batch. Per task instructions, Batch is selected: all changes presented at once, no per-edit approval loop.

2. **Epic 5 is not reopened; new Epic 7 is created.** The task framed this as the key decision. Rationale documented in §3: Epic 5's theme (mockup drift) differs from these stories (live-usage UX), Epic 5 is done with retrospective, and reopening would invalidate the retro. Epic 4 is reserved, Epic 6 exists (backlog) → next epic is Epic 7.

3. **Story A — sweep is in scope; copy rewrite is not.** Assumed the AC's "sweep for other error states" is in scope and the implementer will bring any similarly-detached conversation-context error inline. Assumed only *presentation* is standardized; error *copy* is rewritten only if it clearly violates EXPERIENCE.md §Voice and Tone. The happy-path greeting is the reference treatment.

4. **Stories B/C — shared dim+spinner treatment; sidebar item itself shows no separate loading.** Assumed a single shared transition-loading pattern: content-pane opacity dim + small spinner, existing content visible underneath (not an empty skeleton flash — better for artifact switching where outgoing content is meaningful). Assumed the sidebar nav item does *not* render its own loading indicator (the active state + content-area loading suffice; avoids double-signaling). This resolves both stories' "decide jointly" open questions.

5. **Stories B/C — distinct from the PRD post-MVP "async completion badge."** PRD §6.2 line 430 lists "In-app async completion badge when switching pages during a long session" as post-MVP. Assumed this is *not* a conflict: that item notifies completion of a long-running background op *after* the user navigated away, whereas Stories 7.2/7.3 are transient loading feedback *during* a transition. Flagged in §Artifact Conflicts so a reader doesn't conflate them.

6. **Story D — `:focus-visible` approach (the recommended reconciliation), not full removal.** Assumed the recommended path: navigation surfaces use `:focus-visible` (ring on keyboard, suppressed on mouse click), input/action surfaces keep `:focus` (ring on all focus). Keyboard accessibility (WCAG 2.4.7) is preserved. Full removal of keyboard focus is explicitly **not** taken (would need its own sign-off and is not recommended). The "keep visible" list (chat input, Run/Retry/Send/Save/Stop, search/filter inputs, tab controls, modal controls, tree toggles, copy buttons, slash picker) is assumed correct — the chat input was explicitly flagged as fine and unchanged.

7. **Story E — extends relative time beyond 1 minute; absolute moves to hover; live-updating is in scope.** Resolved the open questions: absolute time via hover tooltip (accessible but not prominent). Thresholds: <1min "just now", 1–59min "X minutes ago", 1–23hr "X hours ago", 24hr–6days "yesterday"/"X days ago", ≥7 days absolute date. Live-updating on a ~60s interval while the conversation view is open is in scope; cleared on unmount.

8. **Story E — also requires a PRD update, not just UX-DR4.** The task flagged only UX-DR4 overlap, but PRD §4 FR-10 (line 265) explicitly mandates wall-clock time for older messages. This was discovered during analysis and added as a required artifact change (§4.5). Assumed this PRD refinement is presentation-level (within shipped FR-10), not an MVP scope change.

9. **No architecture changes.** Assumed (verified by scanning `architecture.md`) that all five stories are frontend presentation only — no backend, data model, schema, API, or infra impact. The only architecture loading reference is `RefreshButton.tsx`'s sync spinner, which is unrelated.

10. **Spec artifact edits (epics.md UX-DRs, EXPERIENCE.md, DESIGN.md, PRD, sprint-status.yaml) are specified in this proposal but not applied by this run.** Following the pattern of the 2026-07-08 and 2026-07-11 reference proposals (both marked "Pending Approval"), this run produces the *proposal* document only. The actual edits to epics.md, sprint-status.yaml, the UX specs, and the PRD are post-approval implementation steps carried out by the handoff recipients in §5. The proposal contains the exact old→new text so approval triggers direct application.

11. **Epic 7 is independent of Epic 6 and may be prioritized ahead of it.** Assumed the UX stories can ship before or during Epic 6's backend migration since they have no dependency on agent execution location. Sequencing is a backlog decision for the PM, not blocked by this proposal.

---

## Blockers / Decisions Needing Human Sign-off Before Implementation

1. **Story 7.4 accessibility trade-off.** The `:focus-visible` approach preserves keyboard focus (WCAG-compliant) but suppresses mouse-click focus on navigation surfaces. This is a deliberate, if minor, accessibility decision and the UX Designer (and ideally someone with accessibility responsibility) should explicitly confirm it before implementation. *If* the team prefers to suppress even keyboard focus on some surfaces, that is a separate, larger trade-off requiring its own sign-off and is **not** recommended here.

2. **PRD text edits require PM sign-off.** Story 7.5 changes PRD §4 FR-10 (line 265). While it is a presentation refinement (not a scope/goal change), the PRD is the product contract and any edit to it should be explicitly approved by the PM (John) before it lands.

3. **UX-DR4 / UX-DR16 / UX-DR19 changes require UX Designer sign-off.** These design requirements are marked `status: final` in DESIGN.md/EXPERIENCE.md. Editing them re-opens finalized specs; the UX Designer (Sally) should confirm the exact threshold table (Story E), the nav-surfaces list and "keep visible" list (Story D), and the transition-loading pattern (Stories B/C) before implementation.

4. **Confirmation of the conversation error-state inventory (Story 7.1).** The task's Story A lists two known error states (Claude Code error, sandbox-setup error) and asks "are there others?" The implementer should run the sweep described in the AC; if additional detached error states are found, the scope of 7.1 grows and may warrant a quick re-check against UX-DR19/EXPERIENCE.md Conversation Surface States before treating them as in-scope.
