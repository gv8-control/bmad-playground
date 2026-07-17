# Sprint Change Proposal: Story 7.1 AC Amendment — Error Mockups & Design Decisions

**Date:** 2026-07-16
**Trigger:** Story 7.1 ("Unify Error State Presentation in Conversation View") was authored in `epics.md` against error states that had **no visual mockups**. Three new mockups have since been produced (covering all error states on the Conversation and New Conversation surfaces), and two new design decisions have been captured in DESIGN.md's component frontmatter (`{components.blocking-content-message}` and `{components.error-state-tool-pill}`). Story 7.1's acceptance criteria are silent on both the mockups and the decisions; this proposal amends them in place.
**Scope Classification:** Minor — single backlog story's acceptance criteria amended in place. No new stories, no epic changes, no PRD or architecture changes, no sprint replan, no `sprint-status.yaml` change.
**Status:** Approved (autonomous correct-course run, batch mode, per Marius's standing instruction).
**Mode:** Batch — decisions documented in each section below

---

## Section 1: Issue Summary

### Problem Statement

Story 7.1 ("Unify Error State Presentation in Conversation View") was written in `epics.md` (lines 1673–1703) on 2026-07-13 as part of the 7.1–7.5 sprint change proposal (see `sprint-change-proposal-2026-07-13.md`). Its acceptance criteria direct the implementer to "bring every conversation-context error state inline" and to perform "a sweep of conversation-context error states … including at minimum the sandbox-setup error." At the time it was written, **none of the error states it covers had a visual mockup**. Only two of the seven app-shell surfaces had any error rendering mocked (`key-signin.html`, `key-onboarding.html`); all 11 in-app error states were spine-only (per the `.decision-log.md` 2026-07-16 entry).

On 2026-07-16, Marius identified the gap and produced three new mockups:
1. `mockups/error-pattern-gallery.html` — cross-surface gallery of all 6 distinct error rendering patterns, every location labelled
2. `mockups/key-conversation-errors.html` — 7 error states on the Conversation surface in full page context
3. `mockups/key-new-conversation-errors.html` — 4 states on the New Conversation surface (3 blocking + 1 transient)

Two design decisions were made and captured in DESIGN.md (and recorded in `.decision-log.md`):

1. **Blocking content message carries the `negative` color family** — `negative-bg` background, 2px `negative` left border, `negative` icon. New component token: `{components.blocking-content-message}` (DESIGN.md line 209).
2. **Error-state Tool Pill stays neutral** — inherits base `{components.tool-pill}` styling, no visual override. Error signal carried by the adjacent Access Notice or Credential Error Banner; status text ("✕ failed") differentiates from success ("✓ done"). New component token: `{components.error-state-tool-pill}` (DESIGN.md line 225).

DESIGN.md, EXPERIENCE.md, and the mockups are now updated (spines dated 2026-07-16, status remains `final`). **The only artifact still pointing at the old implicit contract is Story 7.1 itself** — its ACs name the sandbox-setup error by example copy and delegate the rest to a sweep, with no reference to the mockups or the two new component specs.

### Evidence

- **Mockup inventory (verified by listing):**
  - `mockups/error-pattern-gallery.html` — 6 patterns: (1) Inline field error, (2) Auth error card, (3) Blocking content message (sub-states 3a–3f: conversation limit, seat limit, session start timeout, history load failure, artifact load error, agent process terminated), (4) Credential Error Banner, (5) Access Notice (sub-states 5a–5c: `RATE_LIMITED`, `ORG_RESTRICTION`, `INSUFFICIENT_PERMISSION`), (6) Error-state Tool Pill.
  - `mockups/key-conversation-errors.html` — 7 states labelled "State 1 of 7" through "State 7 of 7": State 1 history load failure; State 2 reconnecting timeout; State 3 credential failed (mid-conversation); States 4–6 access denied × the three `ACCESS_DENIED` codes; State 7 agent process terminated (circuit breaker).
  - `mockups/key-new-conversation-errors.html` — 4 states: State 1 session start timeout; State 2 conversation limit reached; State 3 seat limit exceeded; State 4 starting session (transient — included as the non-error comparison, since it shares input-hidden placement).
- **DESIGN.md new entries:** `blocking-content-message` (line 209) and `error-state-tool-pill` (line 225) in the `components` frontmatter, plus prose at lines 445–451. DESIGN.md `updated: 2026-07-16`.
- **EXPERIENCE.md mockup references added:** Foundation line 26 (mockup links + cross-surface gallery), Conversation Surface States line 322 (mockup link), New Conversation line 291 (mockup link). EXPERIENCE.md `updated: 2026-07-16`.
- **`.decision-log.md` entry** (lines 131–143) records the trigger, artifacts, and both decisions; spine status noted as `final`, not committed.
- **`epics.md` Story 7.1** (lines 1673–1703): currently silent on mockup references and on the two new component tokens; original "sweep" AC names only three example error states (session-start timeout, reconnect failure, history-load error) as examples.

### Consequences

Without this amendment, the developer who creates Story 7.1's story file from the existing epics.md ACs would have to **either invent visual treatment** for states named only by example, or **read DESIGN.md and EXPERIENCE.md unprompted** and infer the contract. Both options leave the door open to:
- Overriding the Tool Pill's color on failure ("make the error visible") — the explicit 2026-07-16 decision forbids this; an implementer working from the ACs alone would not know.
- Implementing blocking-content-message variants that omit the `negative` icon or left border — the explicit decision mandates both; an implementer working from the ACs alone would only know "place it inline."
- Skipping the New Conversation blocked-entry states (conversation limit, seat limit) when running the sweep — they are not named in the original AC examples and would only be discovered if the implementer read the spine's New Conversation section unprompted.

The amendment removes this ambiguity at the contract layer (the ACs) without changing story scope, count, or priority.

---

## Section 2: Impact Analysis

### Epic Impact

Epic 7 (`epics.md` lines 1664–2110) is the only affected epic. It remains `backlog`. **No epic-level scope change**: no epic ACs modified (Epic 7 has none — it inherits from the PRD and the Live-Usage UX Improvements theme), no stories added or removed, no priority changes.

The only Epic 7 artifact change outside Story 7.1 itself is an **optional third reference line** at `epics.md` lines 1670–1671 (the existing preface paragraph already cites the two prior change proposals). Adding a reference to this proposal mirrors the established convention:

```
**Change proposal (Story 7.1 AC amendment — error mockups):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-16-error-mockups.md`
```

| Epic | Status | Impact |
|-------|--------|--------|
| Epic 1 | done | None. |
| Epic 2 | done | None. |
| Epic 3 | done (incl. retrospective) | None. The error states Story 7.1 unifies were already produced by Epic 3 (Error-State Tool Pill + Access Notice in Story 3.7, agent-process-terminated system message in Story 3.4). This is a presentation-unification pass, not new functionality. |
| Epic 4 | done | None. |
| Epic 5 | done (incl. retrospective) | None. Epic 5's theme (mockup fidelity vs. code drift) is the opposite direction of this change (specs evolve based on missing mockups); reopening Epic 5 would conflate the two categories. |
| Epic 6 | done | None. Epic 6 is a backend execution migration; Story 7.1 is a frontend presentation pass. Independent. |
| Epic 7 | backlog (14 stories) | Story 7.1 ACs amended in place; Epic 7 preface gains an optional third change-proposal reference line; no other changes. |

### Story Impact

**Only Story 7.1 is affected** — verified by reading every Epic 7 story (7.1–7.14) in `epics.md` and matching error/state references against the new mockup inventory:

| Story | Status | Error-state references? | AC change? |
|---|---|---|---|
| 7.1 Unify Error State Presentation | backlog | Primary target. Names "sandbox-setup error", "session-start timeout", "reconnect failure", "history-load error" + sweep. | **Yes — seven surgical edits (see §4)** |
| 7.2 Loading State for Sidebar Page Navigation | backlog | None. Loading states (dim + spinner), not error states. | No |
| 7.3 Loading State for Artifact Switching | backlog | None. Loading states, not error states. | No |
| 7.4 Reduce Focus State Prominence | backlog | None. Focus-ring behavior. | No |
| 7.5 Relative Time for Conversation Timestamps | backlog | None. Timestamps. | No |
| 7.6 Sign-out affordance | backlog | None. Credential copy is referenced as user-facing messaging (5 files), but no visual error-state render. | No |
| 7.7 Repository disconnect | backlog | None. Confirmation dialog is a destructive-action pattern, not an error-state pattern. | No |
| 7.8 New conversation intro prompt | backlog | **Indirect.** Blocked-entry states ("conversation limit reached", "seat limit exceeded") replace the intro prompt — and those are now Blocking Content Message components per the new decision. But 7.8's AC correctly defers: *"the blocking message displays in place of the introductory prompt (per the existing New Conversation blocked-entry-states table)"*. That table lives in EXPERIENCE.md §New Conversation (line 304); 7.1's amendment makes the Blocking Content Message the visible implementation. No AC change needed — 7.8 already depends on the spine. | No |
| 7.9 Side-nav empty state | backlog | None. Empty-state pattern, distinct from error state. | No |
| 7.10 Global 404 page | backlog | None. References `error.tsx` structure (canonical full-page error layout) — separate from the in-chat Blocking Content Message pattern. No mockup overlap. | No |
| 7.11 Conversation delete | backlog | None. Confirmation dialog; not error state. | No |
| 7.12 Conversation rename | backlog | None. Inline edit pattern. | No |
| 7.13 Artifact Browser search/filter | backlog | "No artifacts match your search." is an empty-state copy exception, not an error-state component. | No |
| 7.14 Conversation search / show all | backlog | None. Modal + search pattern. | No |

**Conclusion: 7.2 and 7.3 (the loading-state stories) do NOT need updates.** Loading states follow UX-DR19's dim+spinner transition pattern (`sprint-change-proposal-2026-07-13.md` §4.3), a separate pattern from error states. The new error mockups do not touch loading-state visuals. No other Epic 7 story references an error-state visual that the 2026-07-16 mockup gallery updates.

### PRD Impact

**None.** The PRD (`prds/prd-bmad-easy-2026-06-14/prd.md`) references "error-state Tool Pill" generically in FR-12 (line 301: "a failed `git commit` produces an error-state Tool Pill") and FR-14 (line 337: "the save error is displayed in the chat area as an error-state Tool Pill at the position of the save event, using the same visual presentation as a failed agent tool call"). Neither naming constrains the **visual treatment** of the Tool Pill — that's deferred to UX. The PRD's Voice & Tone rule (EXPERIENCE.md line 154) is preserved by both design decisions (the Blocking Content Message has a title + body + action button; no HTTP codes; status text "✕ failed" is plain ASCII, not a code).

No FRs contradicted; no FRs added or removed; MVP scope unchanged. No MVP deferral.

### Architecture Impact

**None.** `architecture.md` (line 623) describes the `ACCESS_DENIED` event contract and explicitly defers visual treatment to the UX spec:

> *"The Conversation UI renders the failing operation as an error-state Tool Pill (same as the 401 path), plus a classification-specific inline notice in the message stream near the failing pill — NOT the Credential Error Banner and NOT a re-auth prompt… The detailed visual treatment of the inline notice belongs to the UX spec (DESIGN.md / EXPERIENCE.md)."*

The two new component tokens (`{components.blocking-content-message}`, `{components.error-state-tool-pill}`) are pure visual specs — they do not change any event contract, API, data model, SSE event type, or routing. No new endpoint, Server Action, or Prisma query. The classifier dispatch in `tool-pill-classifier.service.ts` (architecture.md line 622) is unchanged: it still emits `CREDENTIAL_FAILURE` / `ACCESS_DENIED` events; only the browser's interpretation is now specified.

### Technical Impact

- **Code:** None pre-implementation. Story 7.1 is `backlog` — no story file exists in `_bmad-output/implementation-artifacts/stories/`. The amended ACs become the input to the next `bmad-create-story` run, which projects them into a story file the Developer agent implements.
- **Infrastructure:** None.
- **Deployment:** None.
- **Testing:** No test changes pre-implementation. Post-implementation, Story 7.1's tests will need to assert against the specific mockup states (Blocking Content Message render for blocking errors; Tool Pill remains neutral for in-stream tool-call failures). AC4 in the amendment makes this verifiable against the gallery.
- **Documentation:** Epic 7 preface paragraph gains one reference line (optional).

---

## Section 3: Recommended Approach

### Selected: Direct Adjustment — Amend Story 7.1's acceptance criteria in place

### Rationale

This is the textbook Direct Adjustment case: a single backlog story whose acceptance criteria are silent on artifacts and design decisions produced after the story was written. The substance of the story does not change (it is still "unify every in-conversation error state's placement and treatment inline"); the amendment merely **makes the existing implicit contract explicit** — naming the mockups the implementer should match, naming the component tokens whose treatment is mandatory, and unpacking the original "sweep" AC into a verifiable inventory traceable to the cross-surface gallery.

Story 7.1 remains `backlog` and is the **ideal** story to amend: it has no story file yet, no developer is mid-implementation, no work would be thrown away. Amending now costs only the AC text; amending after `create-story` runs (or worse, after implementation starts) would cost a story-file rewrite or in-flight rework.

### Alternatives Considered and Rejected

- **Potential Rollback** — not viable. Nothing to roll back (Story 7.1 has no implementation).
- **PRD MVP Review** — not viable. The PRD MVP is unaffected; no scope to defer or reduce.
- **Defer the amendment (implement first, fix later)** — rejected. Implementing Story 7.1 against the current ACs would surface the same ambiguity the 2026-07-16 mockup work was created to resolve; the work to produce the mockups would be wasted.

### Effort, Risk, and Timeline

- **Effort:** ~15 minutes to apply the seven proposed edits to `epics.md` Story 7.1 (after human review).
- **Risk:** Low. No scope expansion (all named states already in the spine), no new dependencies, no architectural change. The amendment only references artifacts the spines already authorize.
- **Timeline impact:** None. Story 7.1 sits in `backlog`; no in-flight work to disrupt.

---

## Section 4: Detailed Change Proposals

All edits target the same artifact: `epics.md` → Story 7.1 (lines 1673–1703). Edits are surgical — the story's title, "As a / I want / So that" narrative, and fourth (Credential Banner contrast) AC are preserved (the Credential Banner AC gets one line amended with a mockup reference). Each proposal below shows OLD → NEW with rationale, grouped by AC.

### 4.1 Pre-amble — add "Reference artifacts" section

**Location:** `epics.md` Story 7.1, immediately below the `So that` narrative (line 1677), before the `**Acceptance Criteria:**` heading (line 1679).

**OLD:** (nothing — no pre-amble exists)

**NEW:**
```
**Reference artifacts (added 2026-07-16 — visual treatment is now explicit, no longer implicit):**

- Error-state mockups — the authoritative visual reference for the states this story unifies:
  - `mockups/key-conversation-errors.html` — 7 error states on the Conversation surface, in full page context
  - `mockups/key-new-conversation-errors.html` — 4 states on the New Conversation surface (3 blocking + 1 transient)
  - `mockups/error-pattern-gallery.html` — cross-surface gallery of all 6 distinct error rendering patterns; every location labelled
- Component specifications (DESIGN.md, the visual identity reference):
  - `{components.blocking-content-message}` — the surface-replacement component used by every error state that hides the chat input and replaces the chat-messages panel. Max-width 480px; `negative-bg` background, 2px `negative` left border, `negative` icon, `sm`/`semibold`/`text-1` title, `sm`/`text-2` body, outlined action button.
  - `{components.error-state-tool-pill}` — the tool-pill variant used when a single agent tool call fails. Inherits base `{components.tool-pill}` styling (no visual override); error signal is carried by an adjacent Access Notice (`{components.access-notice}`) or the full-width Credential Error Banner (`{components.credential-error-banner}`), not by the pill itself. Status text "✕ failed" differentiates from success "✓ done".
- On any conflict between mockups and spines, the spines (DESIGN.md and EXPERIENCE.md §Conversation Surface States, §New Conversation) win (per EXPERIENCE.md Foundation).
```

**Rationale:** The original ACs reference patterns by name ("the new-conversation happy-path greeting") and rely on the implementer reading EXPERIENCE.md unprompted to discover visual rules. The 2026-07-16 mockup production made the visual references concrete; naming them shortens the path from story to verifiable implementation. The Blocking Content Message and Error-State Tool Pill component specs were new design decisions not yet promoted to any story AC; citing their DESIGN.md tokens here anchors them to the work that exercises them.

### 4.2 AC 1 (reference treatment + minimum blocking example)

**OLD:**
```
**Given** the new-conversation happy-path greeting
**When** it renders
**Then** it is the reference treatment: inline in the chat-messages panel, centered in the 824px column, with the established empty-state treatment
**And** every error state that occurs within the conversation context matches this placement and visual treatment (inline, centered in the chat-messages panel) — including at minimum the sandbox-setup error ("Failed to set up the sandbox. Please try again or contact support.")
```

**NEW:**
```
**Given** the new-conversation happy-path greeting
**When** it renders
**Then** it is the reference treatment: inline in the chat-messages panel, centered in the 824px column, with the established empty-state treatment
**And** every error state that occurs within the conversation context matches this placement and visual treatment (inline, centered in the chat-messages panel)
**And** blocking errors — those that hide the chat input and replace the chat-messages panel — including at minimum the session-start / sandbox-setup error — use the Blocking Content Message component (`{components.blocking-content-message}`) per `mockups/key-new-conversation-errors.html` State 1
```

**Rationale:** Ties the abstract "minimum" example to its concrete component and mockup state. Removes the example copy from the AC: the quoted `"Failed to set up the sandbox. Please try again or contact support."` is **illustrative**, and keeping it inside the AC risks the implementer treating it as canonical. The copy lives in the spine; the AC documents the **placement and treatment** contract, not the copy. See §4.8 (Scope notes) for the explicit "illustrative copy" note.

### 4.3 AC 2 (generalize the co-location guarantee to all blocking errors)

**OLD:**
```
**Given** the sandbox-setup error with its Retry button
**When** it renders
**Then** the error message and the Retry action render co-located, inline in the chat-messages panel — not detached above/below the conversation flow
**And** the Retry button's behavior is unchanged — only its placement and visual treatment change
```

**NEW:**
```
**Given** a blocking error state with a Retry action — including the session-start / sandbox-setup error (`mockups/key-new-conversation-errors.html` State 1), the history-load failure (`mockups/key-conversation-errors.html` State 1), and the reconnecting-session timeout (`mockups/key-conversation-errors.html` State 2)
**When** it renders
**Then** the error message and Retry action render co-located, inline in the chat-messages panel — not detached above/below the conversation flow — using the Blocking Content Message component (`{components.blocking-content-message}`)
**And** the Retry button's behavior is unchanged — only its placement and visual treatment change
```

**Rationale:** Generalizes the co-location guarantee from a single example (the session-start error) to every blocking error with a Retry action, and binds each to a labelled mockup state so the implementer has a concrete verification target. This is not scope expansion — the original AC 3 already named session-start timeout, reconnect failure, and history-load error as in-scope examples; this edit makes them primary contract items rather than "find-during-the-sweep" items.

### 4.4 AC 3 (replace "sweep" with gallery-traceable inventory)

**OLD:**
```
**Given** a sweep of conversation-context error states performed during implementation
**When** any additional error state is found that renders outside the conversation flow (e.g. session-start timeout, reconnect failure, history-load error)
**Then** it is brought inline to the same treatment
```

**NEW:**
```
**Given** the cross-surface error inventory in `mockups/error-pattern-gallery.html` (all 6 distinct error rendering patterns: Pattern 1 Inline field error; Pattern 2 Auth error card; Pattern 3 Blocking Content Message; Pattern 4 Credential Error Banner; Pattern 5 Access Notice; Pattern 6 Error-State Tool Pill)
**When** the implementer runs the conversation-context error-state sweep
**Then** every conversation-context error state is traceable to a labelled gallery pattern (Patterns 3–6 for in-conversation surfaces; Patterns 1–2 are pre-app-shell states this story does not touch)
**And** any state that renders outside the conversation flow is brought inline per its gallery pattern's treatment
**And** any state found during implementation that is NOT covered by the gallery is brought inline per the same treatment AND registered as a finding before the story can close
```

**Rationale:** Replaces "find errors via sweep" — a subjective acceptance test — with "verify every conversation-context error state against an authoritative gallery, with new findings registered." The original AC's sweep was intended as a safety net against unanticipated states; the gallery makes the inventory verifiable while preserving the safety net for states discovered during implementation. The "register as a finding before the story can close" clause prevents silent scope growth (a state found during the sweep is noted and triaged rather than absorbed).

### 4.5 New AC (in-stream Error-State Tool Pill + adjacent Access Notice / Credential Error Banner)

**Location:** Insert as a new Given/When/Then AC, between the existing AC 3 (the sweep) and the existing AC 4 (Credential Banner contrast).

**OLD:** (no equivalent — the existing AC 4 only contrasts the inline error against the Credential Banner; it does not specify how the in-stream Error-State Tool Pill itself renders)

**NEW:**
```
**Given** a single agent tool call fails mid-turn — a 401 credential failure on a git operation, or a 403 access-denied (`ACCESS_DENIED` with code `RATE_LIMITED` / `ORG_RESTRICTION` / `INSUFFICIENT_PERMISSION`)
**When** the failing tool call renders in the message stream
**Then** the failing operation renders as the Error-State Tool Pill (`{components.error-state-tool-pill}`) — same styling as the base Tool Pill, no visual override; status text "✕ failed" differentiates from success "✓ done"
**And** the error signal is carried by an adjacent component, NOT by the pill itself:
  - For a credential failure (401 git operation), the Credential Error Banner (`{components.credential-error-banner}`) appears full-width above the message panel — see `mockups/key-conversation-errors.html` State 3
  - For an access-denied (403 git operation), an Access Notice (`{components.access-notice}`) renders inline in the message stream directly below the failing pill, with copy derived from the `ACCESS_DENIED` event's `code` field — see `mockups/key-conversation-errors.html` States 4–6
**And** clicking the Error-State Tool Pill expands to show the raw error output (same expand behavior as the base Tool Pill)
**And** the agent turn does not halt on an access-denied — the tool call's error result is returned to the agent, which adapts (per `architecture.md` §ACCESS_DENIED classification; the agent-process-terminated case in AC 2's gallery is distinct and only fires on a circuit-breaker event, not a single tool-call failure)
```

**Rationale:** Decision 2026-07-16 (Error-State Tool Pill stays neutral) directly affects an implementation choice — the developer must NOT add a visual error variant to the pill. Promoting this to an AC prevents the failure mode where a developer, working only from the original AC 4 ("inline error distinct from Credential Banner"), over-styles the pill to "make the error visible." Also binds the new AC to concrete mockup States 3–6 so the implementer can verify each one visually. The "agent turn does not halt" clause is from the existing architecture contract (architecture.md line 623) but was not previously surfaced in Story 7.1's ACs; promoting it here prevents scope creep toward halting the agent on access-denied.

### 4.6 AC 4 (Credential Banner contrast) — add mockup reference

**OLD:**
```
**Given** an error within the conversation context and the Credential Error Banner (UX-DR10)
**When** both could appear
**Then** the inline error (this story) is distinct from the Credential Error Banner — the banner is the already-specified full-width re-auth surface; this story covers sandbox/session/agent errors that belong in the conversation stream, not credential-health banners
```

**NEW:**
```
**Given** an error within the conversation context and the Credential Error Banner (UX-DR10, `{components.credential-error-banner}`)
**When** both could appear
**Then** the inline error (this story) is distinct from the Credential Error Banner — the banner is the already-specified full-width re-auth surface above the message panel (`mockups/key-conversation-errors.html` State 3 renders both together as the reference); this story covers sandbox/session/agent errors that belong in the conversation stream, not credential-health banners
```

**Rationale:** The State 3 mockup renders the Credential Error Banner and the error-state Tool Pill together on one page — a concrete picture of the relationship. No substantive change.

### 4.7 Scope notes — extend with the two 2026-07-16 design decisions

**OLD:**
```
**Scope notes:**
- Reference treatment = the happy-path new-conversation greeting.
- Presentation (placement + visual treatment) is in scope. Rewriting error message copy wholesale is out of scope — only bring copy into compliance if a message clearly violates the Voice & Tone rules (EXPERIENCE.md §Voice and Tone).
- The Retry button's behavior is unchanged.
```

**NEW:**
```
**Scope notes:**
- Reference treatment = the happy-path new-conversation greeting.
- Two design decisions (Marius, 2026-07-16):
  1. **Blocking content messages carry the `negative` color family** — `negative-bg` background, 2px `negative` left border, `negative` icon. Captured in DESIGN.md `{components.blocking-content-message}`.
  2. **Error-state Tool Pills stay neutral** — they inherit base `{components.tool-pill}` styling with no visual override; the error signal is carried by the adjacent Access Notice or Credential Error Banner. Status text ("✕ failed") differentiates from success ("✓ done"). Captured in DESIGN.md `{components.error-state-tool-pill}`.
- Presentation (placement + visual treatment) is in scope. Rewriting error message copy wholesale is out of scope — only bring copy into compliance if a message clearly violates the Voice & Tone rules (EXPERIENCE.md §Voice and Tone). The example copy quoted in the original AC ("Failed to set up the sandbox. Please try again or contact support.") is illustrative; canonical copy lives in the spine (EXPERIENCE.md and the mockups) — defer to those at edit time.
- The Retry button's behavior is unchanged.
- Mockups are the visual reference; DESIGN.md and EXPERIENCE.md win on any conflict (per EXPERIENCE.md Foundation).
```

**Rationale:** Captures the two design decisions **inline where the implementer will look first** (the story's own scope notes), not delegated to the spine alone. The "illustrative copy" note prevents the implementer from hard-coding the quoted sandbox-setup copy as canonical — the example was removed from AC 1 (§4.2) and is now explicitly demoted here.

### 4.8 Epic 7 preface paragraph — add this proposal's reference (optional)

**Location:** `epics.md` line 1671 (the existing "Change proposal" reference lines, currently citing the 7.1–7.5 and 7.6–7.14 proposals).

**OLD:**
```
**Change proposal (7.1–7.5):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-13.md`
**Change proposal (7.6–7.14):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-16-ux-dead-ends.md`
```

**NEW:**
```
**Change proposal (7.1–7.5):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-13.md`
**Change proposal (7.6–7.14):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-16-ux-dead-ends.md`
**Change proposal (Story 7.1 AC amendment — error mockups):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-16-error-mockups.md`
```

**Rationale:** Mirrors the established convention — every change proposal that touches Epic 7 is cited in the preface. The author of the next `create-story` run on Story 7.1 will see this proposal's path immediately and read it before generating the story file.

### 4.9 What is NOT changed

For review clarity, the following items were considered and explicitly not amended:

- **Story title** ("Unify Error State Presentation in Conversation View") — unchanged; the title is faithful.
- **User story narrative** ("As a / I want / So that") — unchanged.
- **Original AC examples of error states** ("session-start timeout, reconnect failure, history-load error") — preserved verbatim in AC 2 (§4.3) and surfaced as primary examples rather than sweep-only items.
- **Stories 7.2 / 7.3 / 7.4 / 7.5 / 7.6 / 7.7 / 7.9 / 7.10 / 7.11 / 7.12 / 7.13 / 7.14** — no AC changes (see §2 Story Impact table for rationale per story).
- **Story 7.8** — no AC change. Its "blocked-entry state" AC correctly defers to "the existing New Conversation blocked-entry-states table" in the spine; Story 7.1's amendment makes the Blocking Content Message the visible implementation of that table without requiring Story 7.8 to be re-opened.
- **`sprint-status.yaml`** — no change. Epic 7 and Story 7.1 remain `backlog`; no status transitions needed because no implementation has begun.

---

## Section 5: Implementation Handoff

### Scope Classification: Minor

**Justification for Minor (per `bmad-correct-course` SKILL.md):** Direct amendment of a single backlog story's acceptance criteria. All seven edits (§4.1–§4.7) target the same story (7.1) in the same artifact (`epics.md`). The eighth edit (§4.8) is a one-line reference addition to the Epic 7 preface. There are **no new stories, no epic changes, no PRD changes, no architecture changes, no sprint replan, no priority changes, no sprint-status.yaml changes**. The substance of Story 7.1 is preserved; only the visual contract is made explicit. This fits the SKILL's definition of "Minor: Direct implementation by Developer agent."

### Handoff Recipients

| Role | Responsibility | Deliverable |
|------|----------------|-------------|
| Marius (Product Owner / BMM user) | Review this proposal; approve or request edits. If approved, apply the seven edits (§4.1–§4.7) plus the optional one-line preface reference (§4.8) to `epics.md`. | Approved edits applied to `epics.md` Story 7.1; Epic 7 preface reference line. |
| Developer agent (next `bmad-create-story` run on Story 7.1) | Create the Story 7.1 story file from the **amended** ACs (NOT the current ones in `epics.md` lines 1673–1703). The amended ACs are the input contract. | A Story 7.1 story file in `_bmad-output/implementation-artifacts/stories/`. |
| Developer agent (Story 7.1 implementation) | Implement the Blocking Content Message component (or refine its existing shadcn-derived component to match `{components.blocking-content-message}`); wire each labeled mockup state's render through it; ensure Error-State Tool Pill never receives a visual error override; ensure Access Notice / Credential Error Banner render adjacent per §4.5. Verify against `mockups/key-conversation-errors.html` States 1–7 and `mockups/key-new-conversation-errors.html` States 1–3. | Code + tests; story moves to `review`. |

### Recommended Implementation Order

1. **Approve / revise** this proposal (Marius).
2. **Apply the seven edits** to `epics.md` Story 7.1 + the optional preface line (Marius). Per `CLAUDE.md`, do not auto-commit `_bmad-output` changes — wait for Marius's explicit instruction.
3. **Run `create-story 7.1`** — generate the story file from the amended ACs.
4. **Implement Story 7.1** — Developer agent. The reference artifacts in §4.1 are the visual contract.

### Success Criteria

- All seven amended ACs are present in `epics.md` Story 7.1 before the story file is created.
- The story file generated from Story 7.1 references the three mockups and the two component tokens (the reference artifacts preamble in §4.1).
- The implementation passes:
  - Every Blocking Content Message state renders per `{components.blocking-content-message}` (negative color family).
  - Every Error-State Tool Pill renders identically to the base Tool Pill (no visual error override).
  - Access Notices appear adjacent to failing Error-State Tool Pills per `mockups/key-conversation-errors.html` States 4–6.
  - The Credential Error Banner placement and the in-stream Error-State Tool Pill placement are visually distinct per State 3.
  - The cross-surface gallery is cited as the verification reference in the implementation summary.

### Findings from the checklist that may surprise Marius

1. **The amend-before-create-story window is open.** Story 7.1 is `backlog` — no story file exists yet. Amending now costs ~15 minutes of AC text; amending after `create-story` would cost a story-file rewrite; amending after implementation starts would cost in-flight rework. Timing is ideal.
2. **Stories 7.2 and 7.3 (loading states) do not need updates.** They were the obvious adjacent candidates — but loading states follow UX-DR19's dim+spinner transition pattern, which is orthogonal to the error-state mockup gallery. No shared visual contract.
3. **Story 7.8 (new conversation intro prompt) does not need updates either, despite its "blocked entry state" AC.** Story 7.8's AC correctly defers to "the existing New Conversation blocked-entry-states table" in the spine. Story 7.1's amendment makes the Blocking Content Message the visible implementation of that table — Story 7.8 inherits the treatment through the spine dependency without needing its own AC change.
4. **The original AC's quoted "Failed to set up the sandbox. Please try again or contact support." is illustrative, not canonical.** Cross-referencing the spine (`mockups/key-new-conversation-errors.html` State 1 + EXPERIENCE.md §New Conversation Session start timeout line 309), the canonical copy is "Starting your session is taking longer than expected." The amendment explicitly demotes the original quote to illustrative; canonical copy lives in the spine and mockups — defer to those at edit time. This is in §4.7 (scope notes) and is the closest the amendment comes to "rewriting copy" — but it does not rewrite copy in either AC or spine; it only clarifies which source is authoritative.
5. **`architecture.md` does NOT need changes.** Line 623 already explicitly defers the Access Notice visual treatment to the UX spec. The two new component decisions are pure visual specs — they don't change any event contract, API, or data model. Many similar proposals require an architecture review; this one does not.
6. **The PRD does NOT need changes.** The PRD references "error-state Tool Pill" generically in FR-12 and FR-14 without constraining its visual treatment (deferred to UX). Both design decisions preserve the PRD's Voice & Tone rules. No FRs added, removed, or changed.

### Workflow Execution Log

- **Workflow:** `bmad-correct-course`
- **Mode:** Batch (autonomous)
- **Checklist status:** §1 Trigger & Context — [x] Done (1.1, 1.2, 1.3). §2 Epic Impact — [x] Done (2.1, 2.2, 2.3, 2.4, 2.5 — all "no change" findings). §3 Artifact Conflict — [x] Done for 3.1 (PRD no change), 3.2 (Architecture no change), [N/A] for 3.3 (UX spines already updated prior to this workflow), [x] Done for 3.4 (no other artifacts touched). §4 Path Forward — [x] Viable for 4.1 (Direct Adjustment selected), [N/A] for 4.2 (no rollback), [N/A] for 4.3 (no MVP review), [x] Done for 4.4 (Direct Adjustment selected, rationale documented). §5 Sprint Change Proposal — captured in this document's Sections 1–4. §6 Final Review — this document is the review artifact; user approval pending.
- **Artifacts modified by this workflow:** this proposal file only (`sprint-change-proposal-2026-07-16-error-mockups.md`). No other artifacts touched. Per task constraints: DESIGN.md, EXPERIENCE.md, mockups, `epics.md`, and `sprint-status.yaml` were NOT modified — the proposed `epics.md` edits are in §4 for human review before applying.
- **Not committed to git** — per Marius's standing instruction and `CLAUDE.md`'s "do not automatically commit `_bmad-output` changes" rule.
