---
project_name: bmad-easy
date: '2026-07-16'
target_epic: 'Epic 7 (extension — stories 7.6–7.14)'
stepsCompleted:
  - cross-artifact-alignment
  - per-story-completeness
  - spec-alignment
  - architecture-alignment
  - cross-story-dependencies
  - contradiction-sweep
  - missing-specc-check
  - final-assessment
documentsIncluded:
  - sprint-change-proposal-2026-07-16-ux-dead-ends.md
  - prds/prd-bmad-easy-2026-06-14/prd.md
  - ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md
  - architecture-review-ux-dead-ends-2026-07-16.md
  - epics.md (Epic 7, stories 7.6–7.14)
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-16
**Project:** bmad-easy
**Target:** Epic 7 extension — stories 7.6–7.14 (UX dead-ends and missing maintenance surfaces)

## Scope

This report validates that the artifacts produced for the 2026-07-16 UX dead-ends extension to Epic 7 are aligned, complete, and implementable. A developer should be able to pick up any story (7.6 through 7.14) and start coding without hitting a missing spec, a contradiction, or an undefined edge case.

**Artifacts under review:**

| Artifact | Type |
|----------|------|
| `sprint-change-proposal-2026-07-16-ux-dead-ends.md` | Sprint change proposal (approved) |
| `prd.md` (§4.1 FR-21, §4.5 FR-20) | PRD amendments |
| `EXPERIENCE.md` | UX spec (7 amended sections) |
| `architecture-review-ux-dead-ends-2026-07-16.md` | Architecture review (5 backend items) |
| `epics.md` (lines 1824–2111) | 9 new stories appended to Epic 7 |

**Reference:** `implementation-readiness-report-2026-07-11.md` (format template), `project-context.md` (implementation conventions).

---

## Summary

### Overall Verdict: READY WITH CONDITIONS

The 9 new stories (7.6–7.14) are well-authored with specific, testable Given/When/Then acceptance criteria, comprehensive scope notes, and explicit references to UX spec sections, PRD FRs (where applicable), and architecture review items. Cross-checks against EXPERIENCE.md, the PRD, and the architecture review confirm that every interaction pattern referenced in a story is specified in the UX spec, every backend concern is documented in the architecture review, and the wave sequencing across artifacts is consistent.

Three non-blocking conditions should be resolved before sprint execution begins: a stale PRD §8 text that contradicts FR-20 and FR-21, a missing FR-11 clarifying note, and missing `sprint-status.yaml` entries for the new stories. None of these block a developer from picking up a story spec and implementing it — the story specs are self-sufficient — but they should be cleaned up for artifact consistency and sprint tracking.

### Assessment Statistics

| Category | Count |
|----------|-------|
| Stories assessed | 9 (7.6–7.14) |
| Blocking issues | 0 |
| Non-blocking issues | 3 |
| Informational observations | 3 |

---

## Per-Story Assessment

Legend: ✓ = aligned/complete; ⚠ = minor concern (does not block implementation); ✗ = gap or contradiction (blocks implementation).

### Story 7.6: Sign-out affordance (avatar dropdown)

| Dimension | Status | Notes |
|-----------|--------|-------|
| Story completeness | ✓ | As a / I want / So that present. 4 Given/When/Then ACs, each specific and testable. Scope notes document the supersedence, frontend-only nature, token behavior, and references. |
| Spec alignment | ✓ | References EXPERIENCE.md §Avatar Account Menu (amended 2026-07-16). UX spec contains the dropdown pattern with menu items, keyboard behavior, outside-click dismiss, and the "Sign out" → `/sign-in` redirect. FR-20 reference verified — PRD §4.5 FR-20 covers avatar dropdown, sign-out, session termination, sandbox independence. |
| Architecture alignment | ✓ | Architecture review §1 confirms frontend-only wiring — `signOut()` already exported from `apps/web/src/lib/auth.ts:18`, Radix dropdown in `components/ui/dropdown-menu.tsx`. Token invalidation behavior documented (stateless JWT, boundary JWT not explicitly invalidated, `ActiveUserGuard` per-request lookup). No new endpoint or Server Action. |
| Dependencies | ✓ | States "No dependencies on other stories in Epic 7." Consistent with Wave 1 placement. |
| Contradictions | ⚠ | PRD §8 still describes the avatar as "the entry point to Settings" and Settings as "an empty 'coming soon' page" — contradicts FR-20. FR-20 itself acknowledges the change ("the avatar — described in §8 as the side-navigation entry point — becomes a dropdown"). See cross-cutting finding #1. |

**Verdict:** Ready. The §8 PRD inconsistency is a documentation gap, not a story-level defect — the story spec is self-sufficient and explicitly supersedes the prior avatar spec.

---

### Story 7.7: Repository disconnect from Settings

| Dimension | Status | Notes |
|-----------|--------|-------|
| Story completeness | ✓ | As a / I want / So that present. 4 Given/When/Then ACs covering page render, confirmation dialog, disconnect cascade (browser → agent-be → Server Action → redirect), and post-disconnect re-onboarding. Scope notes document switching-as-disconnect, the architecture choice, the no-server-to-server rule, cascade behavior, references. |
| Spec alignment | ✓ | References EXPERIENCE.md §Settings (amended 2026-07-16). UX spec contains Repository section with connected-repo display, Disconnect button with destructive styling, confirmation dialog (title, body, actions), and the disconnect flow (terminate sandboxes → delete RepoConnection → redirect to /onboarding). FR-21 reference verified — PRD §4.1 FR-21 covers disconnect affordance, confirmation dialog content, sandbox termination, RepoConnection deletion, redirect, OAuthCredential retention, artifact persistence, no cooling-off period. Dialog body copy in story matches UX spec verbatim. |
| Architecture alignment | ✓ | Architecture review §2 documents the new `DELETE /api/conversations` (no `:id`) agent-be endpoint, the `disconnectRepository()` Server Action, the browser-direct call sequence, and resolves the web→agent-be server-to-server prohibition (browser-direct call preserves the boundary). Rate-limiting, partial-failure handling, and in-memory state recovery covered in §Risks. Story AC specifies endpoint name, call sequence, and cascade behavior precisely. |
| Dependencies | ✓ | "Soft navigation dependency on Story 7.6" — documented with rationale (avatar dropdown's "Settings" link is the path to /settings once avatar is no longer a direct link). Alternative path required if 7.7 ships without 7.6. Consistent with Wave 1 (7.6 precedes 7.7). |
| Contradictions | ⚠ | PRD §8 "Settings is present in MVP as an empty 'coming soon' page" contradicts FR-21 (Settings gains a Repository section). See cross-cutting finding #1. |

**Verdict:** Ready. Most complex story in the set — the architecture conflict (server-to-server prohibition) was explicitly resolved with a clear recommended approach. Cross-check confirms endpoint, Server Action, cascade sequence, and credential cleanup are all specified.

---

### Story 7.8: New conversation intro prompt

| Dimension | Status | Notes |
|-----------|--------|-------|
| Story completeness | ✓ | As a / I want / So that present. 3 Given/When/Then ACs covering intro prompt rendering, transition on first message, and blocked-state precedence. Scope notes document the prior placeholder-only implementation, the spec treatment, and the Story 7.1 reference. |
| Spec alignment | ✓ | References EXPERIENCE.md §New Conversation (amended 2026-07-16). UX spec contains the intro prompt copy ("Press `/` to browse available skills, or type a message to start."), confirmed as rendered platform copy centered in the chat-messages panel (not a textarea placeholder). PRD FR-9 already specified "a prompt in the chat area suggesting the user press `/`" — this story aligns the implementation to the FR; no new FR needed. |
| Architecture alignment | ✓ | Frontend-only; no backend work. No architecture review section required (the architecture review explicitly excludes findings 3, 6, 7 as no architecture impact). |
| Dependencies | ✓ | "No dependencies on other stories." Story 7.1 reference is for visual treatment parity (reference treatment), not a hard dependency. Consistent with Wave 1. |
| Contradictions | ✓ | None. |

**Verdict:** Ready. Lowest-complexity story in the set.

---

### Story 7.9: Side-nav conversation empty state

| Dimension | Status | Notes |
|-----------|--------|-------|
| Story completeness | ✓ | As a / I want / So that present. 2 Given/When/Then ACs covering empty-state rendering and replacement on first conversation creation. Scope notes document the minimal treatment (no illustration), references. |
| Spec alignment | ✓ | References EXPERIENCE.md §Conversation List Interactions → Empty State (Finding 7). UX spec contains the "No conversations yet" muted text, color/typography tokens, no illustration. |
| Architecture alignment | ✓ | Frontend-only; no backend work. Excluded from architecture review (Finding 7 has no architecture impact). |
| Dependencies | ✓ | "Logically pairs with Story 7.11 (delete)... No hard dependency — implementable independently." Documented and consistent with Wave 1 placement (7.9 ships without 7.11). |
| Contradictions | ✓ | None. |

**Verdict:** Ready. Trivial frontend change.

---

### Story 7.10: Global 404 page

| Dimension | Status | Notes |
|-----------|--------|-------|
| Story completeness | ✓ | As a / I want / So that present. 3 Given/When/Then ACs covering route match failure, in-shell rendering (side nav visible), and out-of-shell rendering (unauthenticated). Scope notes document the error-state gap closure, no separate mockup, references. |
| Spec alignment | ✓ | References EXPERIENCE.md §Not Found (404) (amended 2026-07-16). UX spec contains the `not-found.tsx` page pattern mirroring `error.tsx`, the h1/body/link content, the `<h1 tabIndex={-1}>` for AppShell route-focus, and the shell-context behavior (in-shell vs. out-of-shell). |
| Architecture alignment | ✓ | Frontend-only; no backend work. Excluded from architecture review (Finding 3 has no architecture impact). |
| Dependencies | ✓ | "No dependencies on other stories." Consistent with Wave 2. |
| Contradictions | ✓ | None. |

**Verdict:** Ready. Closes the one gap in the error-state system.

---

### Story 7.11: Conversation delete

| Dimension | Status | Notes |
|-----------|--------|-------|
| Story completeness | ✓ | As a / I want / So that present. 4 Given/When/Then ACs covering delete affordance reveal (hover/focus), confirmation dialog, delete action (browser-direct endpoint call + side-nav refresh), and active-conversation redirect to Project Map. Scope notes document endpoint existence, permanent-delete decision, no schema migration, concurrent-access handling, FR-11 wall relief, references. |
| Spec alignment | ✓ | References EXPERIENCE.md §Conversation List Interactions → Delete. UX spec contains the trash-icon button (hover/focus reveal, separate focusable, aria-label), confirmation dialog (title/body/actions), and the on-confirm flow (sandbox termination, record deletion, side-nav refresh, redirect if active). Story AC for confirmation body matches UX spec verbatim. |
| Architecture alignment | ✓ | Architecture review §4 confirms the endpoint already exists (`DELETE /api/conversations/:id` → `abandonConversation`, `conversations.controller.ts:84`). Documents the 7-step teardown, cascade deletes (Turn, CostRecord), side-nav refresh via `router.refresh()`, concurrent-access handling (SSE drop, existing onerror handler). Story is frontend wiring only. |
| Dependencies | ✓ | "Pairs with Story 7.12 (rename) — both touch side-nav conversation interactions; implement together." Consistent with Wave 2. |
| Contradictions | ⚠ | Story scope notes reference "the FR-11 clarification added alongside this story references the delete capability" — but the PRD's FR-11 text has no such clarifying note. The sprint change proposal §4.5 item 3 specified appending this note; it was not applied to the PRD. See cross-cutting finding #2. Non-blocking — the story is self-sufficient without it; the developer knows from the story that delete relieves the FR-11 limit. |

**Verdict:** Ready. The missing FR-11 clarification is a PRD-level documentation gap, not a story-level defect.

---

### Story 7.12: Conversation rename

| Dimension | Status | Notes |
|-----------|--------|-------|
| Story completeness | ✓ | As a / I want / So that present. 4 Given/When/Then ACs covering rename affordance reveal, edit-mode entry, empty-title rejection, and valid-title save with Server Action + side-nav refresh. Scope notes document Server Action location, no schema migration, Zod schema, no uniqueness constraint, typed-result-union pattern, references. |
| Spec alignment | ✓ | References EXPERIENCE.md §Conversation List Interactions → Rename. UX spec contains the pencil-icon button (hover/focus reveal alongside delete), double-click-to-edit, inline text input (pre-populated, text selected, maxLength), keyboard behavior (Enter saves, Escape cancels, blur = save), empty-title rejection. Story ACs match UX spec. |
| Architecture alignment | ✓ | Architecture review §5 documents the new Server Action in `apps/web/src/actions/conversation.actions.ts` performing a Prisma `conversation.update`. Justifies Server Action over agent-be endpoint (non-live metadata, `apps/web` owns synchronous data operations). Zod schema with `title: z.string().min(1).max(100)`, matching frontend maxLength per `project-context.md:141`. Tenant isolation via `findFirst({ where: { id, userId } })`. Story ACs and scope notes align with architecture review. |
| Dependencies | ✓ | "Pairs with Story 7.11 (delete) — both touch side-nav conversation interactions; implement together." Consistent with Wave 2. |
| Contradictions | ✓ | None. |

**Verdict:** Ready.

---

### Story 7.13: Artifact Browser search and filter

| Dimension | Status | Notes |
|-----------|--------|-------|
| Story completeness | ✓ | As a / I want / So that present. 4 Given/When/Then ACs covering search/filter control rendering, live filtering with URL query-param persistence, filter clearing, and no-matches empty state. Scope notes document client-side filtering for MVP, post-MVP server-side path, references. |
| Spec alignment | ✓ | References EXPERIENCE.md §Artifact Search and Filter (amended 2026-07-16). UX spec contains the search input (placeholder, clear button, case-insensitive substring filter), type filter (pill buttons or dropdown, "All" default), filter state persistence in URL query params, no-matches empty state ("No artifacts match your search."), and the implementation note (client-side for MVP). Story ACs match UX spec. |
| Architecture alignment | ✓ | Architecture review §8 (Finding 8) confirms client-side filtering of the server-rendered artifact list — no new endpoint, Server Action, or Prisma query. Lists the `Artifact` table index (`@@index([repoConnectionId, lastModifiedAt])`) for post-MVP server-side search. NFR-P4 unaffected. |
| Dependencies | ✓ | "No dependencies on other stories." Consistent with Wave 3. |
| Contradictions | ✓ | None. |

**Verdict:** Ready.

---

### Story 7.14: Conversation search / show all

| Dimension | Status | Notes |
|-----------|--------|-------|
| Story completeness | ✓ | As a / I want / So that present. 4 Given/When/Then ACs covering "Show all" link appearance (>5 conversations), modal opening (standard dialog pattern, title, search input, scrollable list), live search filtering, and conversation selection navigation. Scope notes document modal-over-route choice, Server Action (Prisma query without take: 5 limit, returns { id, title, lastActiveAt }), client-side search for MVP, Conversation table index, references. |
| Spec alignment | ✓ | References EXPERIENCE.md §Conversation List Interactions → Show All. UX spec contains the "Show all" link (appears when >5 conversations), modal (title "Conversations", search input "Search conversations…", full scrollable list with relative timestamps, selection navigation, standard dialog pattern). Story ACs match UX spec. Modal choice resolves the open question from the sprint change proposal (§5 Blocker #5) — the UX spec chose modal over `/conversations` route for MVP simplicity. |
| Architecture alignment | ✓ | Architecture review §9 (Finding 9) documents the new Server Action querying Prisma without the `take: 5` limit, returning `{ id, title }` shape plus `lastActiveAt`. Justifies Server Action over agent-be endpoint (non-live data, `apps/web` reads Postgres directly). Client-side filtering for MVP (max 10 conversations per FR-11). Conversation table has `@@index([userId, lastActiveAt])`. |
| Dependencies | ✓ | "Soft dependency on Story 7.5 (relative-time treatment for the timestamp column); acceptable to ship 7.14 with an alternate fallback (relative-only without live updates, or absolute time) if 7.5 is delayed." Documented with fallback. Consistent with Wave 3 (7.5 is in the pre-existing set, likely done or in progress). |
| Contradictions | ✓ | None. |

**Verdict:** Ready. The open UX decision (modal vs. route) flagged in the proposal was resolved in the UX spec (modal chosen).

---

## Cross-Cutting Findings

### 1. PRD §8 Constraints & Guardrails contradicts FR-20 and FR-21 (non-blocking)

**Severity:** Non-blocking (documentation inconsistency).

**Finding:** PRD §8 (Constraints & Guardrails, line 502) describes the side navigation's avatar as "a user avatar circle displaying the user's initials as the entry point to Settings. Settings is present in MVP as an empty 'coming soon' page." This text was not updated when FR-20 and FR-21 were added to the PRD.

- FR-20 (Story 7.6) changes the avatar from a link to `/settings` into a dropdown menu containing "Sign out." FR-20 itself acknowledges the change: "The avatar — described in §8 as the side-navigation entry point — becomes a dropdown containing account actions."
- FR-21 (Story 7.7) replaces the "coming soon" Settings placeholder with a real "Repository" section containing a "Disconnect" action.

**Impact:** §8 is the canonical reference for the navigation model (the PRD itself notes it lives in §8 "rather than in §4 Features"). A developer consulting §8 for the avatar or Settings description would find stale text. However, the story specs (7.6 and 7.7) are self-sufficient — they explicitly state "supersedes the prior avatar spec" and "replaces the prior 'coming soon' static placeholder" — so implementation is not blocked.

**Resolution:** Update PRD §8 to reflect that the avatar is a dropdown menu trigger (not a plain link to `/settings`) and that Settings contains a Repository section with a Disconnect action (not an empty "coming soon" page). Add an amendment note dated 2026-07-16.

### 2. Missing FR-11 clarifying note (non-blocking)

**Severity:** Non-blocking (documentation gap).

**Finding:** The sprint change proposal §4.5 item 3 specified: "FR-11 clarification (not a contradiction)... a clarifying note is appended to FR-11 referencing the delete capability. No wording of the limit itself changes." Story 7.11's scope notes reference this clarification as if it exists: "the FR-11 clarification added alongside this story references the delete capability." However, the PRD's FR-11 text (§4.3) has no such clarifying note — the FR-11 consequences list still reads identically to its pre-amendment form.

**Impact:** The developer implementing Story 7.11 knows from the story scope notes that delete relieves the FR-11 limit, so implementation is not blocked. The gap is that the PRD (the product contract) does not yet reflect this clarification, creating a minor inconsistency between the proposal, the story, and the PRD.

**Resolution:** Append a clarifying note to FR-11 in the PRD: e.g., "Once conversation delete (Story 7.11) ships, this limit is a manageable constraint rather than a permanent wall — users can delete conversations to make room."

### 3. Missing `sprint-status.yaml` entries for stories 7.6–7.14 (non-blocking)

**Severity:** Non-blocking (operational tracking gap).

**Finding:** The sprint change proposal §4.7 specified appending 9 entries to `sprint-status.yaml` after the existing `7-5-...` line:

```yaml
7-6-sign-out-affordance: backlog
7-7-disconnect-or-switch-repository: backlog
7-8-new-conversation-intro-prompt: backlog
7-9-side-nav-empty-state: backlog
7-10-global-404-page: backlog
7-11-conversation-delete: backlog
7-12-conversation-rename: backlog
7-13-artifact-browser-search-or-filter: backlog
7-14-conversation-search-or-show-more: backlog
```

The `last_updated` timestamp in the file was updated to `2026-07-16T18:00:00Z`, but the 9 story entries are absent — the file ends at `7-5-relative-time-for-conversation-timestamps: backlog` (line 131).

**Impact:** The `sprint-status.yaml` is the operational sprint tracking file. Without these entries, the 9 new stories cannot have their status tracked through the sprint workflow (backlog → ready-for-dev → in-progress → review → done). The story specs exist in `epics.md` (the canonical story source), so a developer can still read and implement them, but sprint tracking is incomplete.

Additionally, the Epic 7 comment block in `sprint-status.yaml` (lines 122–125) still describes "Five UX gaps discovered from live-app usage" and "Frontend presentation changes only" — outdated since the extension adds 9 stories, 5 of which touch backend concerns.

**Resolution:** Append the 9 story entries to `sprint-status.yaml` and update the Epic 7 comment block to reflect the extension to 14 stories (7.1–7.14) with mixed frontend-only and backend-touching scope.

---

## Informational Observations

### A. PRD YAML frontmatter duplicate `status` keys

**Observation:** The PRD frontmatter (lines 3–8) contains two `status` keys:

```yaml
status: draft
created: 2026-06-14
updated: 2026-07-16
status: approved
approved_by: John (Product Manager)
```

YAML parsers resolve duplicate keys to the last value, so the effective status is `approved`. This appears to be a pre-existing issue (the original `status: draft` was not removed when `status: approved` was added). No impact on implementation; noted for cleanup.

### B. Architecture review notes as standalone document

**Observation:** The sprint change proposal §4.6 suggested that `architecture.md` "gains review notes for the five backend-touching items." The architecture review exists as a standalone document (`architecture-review-ux-dead-ends-2026-07-16.md`) rather than being appended to the main `architecture.md`. All 9 stories reference "architecture review §X" which resolves to sections in the standalone document. The reference chain works — a developer following a story's scope notes reaches the architecture review correctly.

### C. Open UX decision for Story 7.14 resolved

**Observation:** The sprint change proposal §5 (Blockers / Decisions Needing Human Sign-off, item 5) flagged the full conversation list surface choice (modal vs. `/conversations` route) as an open decision. The UX spec resolves this: EXPERIENCE.md §Conversation List Interactions → Show All specifies a modal "chosen over a dedicated `/conversations` route for MVP simplicity." Story 7.14's scope notes reflect this resolution. No action needed.

---

## Cross-Story Dependency Validation

### Dependency graph (from story scope notes)

| Story | Declared dependencies | Wave | Consistent? |
|-------|----------------------|------|-------------|
| 7.6 | None | 1 | ✓ |
| 7.7 | Soft nav dependency on 7.6 (must have path to /settings) | 1 | ✓ (7.6 in same wave) |
| 7.8 | None (Story 7.1 reference is visual treatment, not hard dep) | 1 | ✓ |
| 7.9 | Logical pair with 7.11 (no hard dependency) | 1 | ✓ (ships without 7.11) |
| 7.10 | None | 2 | ✓ |
| 7.11 | Pairs with 7.12 (implement together) | 2 | ✓ |
| 7.12 | Pairs with 7.11 (implement together) | 2 | ✓ |
| 7.13 | None | 3 | ✓ |
| 7.14 | Soft dependency on 7.5 (relative-time); fallback documented | 3 | ✓ (7.5 in pre-existing set) |

### Wave sequencing consistency

The wave sequencing is defined in the sprint change proposal §4.2 and is consistent across artifacts:

| Wave | Stories | Rationale | Consistent with story scope notes? |
|------|---------|-----------|------------------------------------|
| 1 | 7.6, 7.7, 7.8, 7.9 | Dead ends unblocked + trivial wins | ✓ (7.7 depends on 7.6; both in Wave 1) |
| 2 | 7.10, 7.11, 7.12 | Maintenance hatches | ✓ (7.11 + 7.12 paired; both in Wave 2) |
| 3 | 7.13, 7.14 | Scale features | ✓ (7.14 soft-depends on 7.5, which is pre-existing) |

**Circular dependencies:** None.
**Missing dependencies:** None.

---

## Missing Specs Check

| Check | Result |
|-------|--------|
| Interaction patterns referenced in stories but not in UX spec | ✓ None. All 9 stories' interaction patterns are specified in EXPERIENCE.md amended sections. |
| Backend endpoints referenced in stories but not in architecture review | ✓ None. The new `DELETE /api/conversations` (7.7), existing `DELETE /api/conversations/:id` (7.11), new rename Server Action (7.12), and new conversation-list Server Action (7.14) are all documented with implementation sequences and justifications. |
| Undefined terms in story spec | ✓ None. All technical references (file paths, function names, endpoint names, schema fields) resolve to specific locations in the architecture review or existing codebase. |

---

## Unresolved Issues

**None blocking implementation.** All 9 stories are implementable as written. The three non-blocking conditions (PRD §8 stale text, missing FR-11 note, missing sprint-status.yaml entries) are documentation and tracking gaps that should be cleaned up for artifact consistency, but a developer reading any story spec has everything needed to begin coding.

The sprint change proposal's own "Blockers / Decisions Needing Human Sign-off" section (§5) flagged 5 items for pre-implementation sign-off:

| Proposal blocker | Resolved? |
|-----------------|-----------|
| 1. Destructive-action confirmation dialogs (7.7, 7.11) — copy and side-effect sequence confirmation | ✓ Resolved — UX spec specifies exact dialog copy (title, body, actions) for both 7.7 and 7.11; architecture review §2 and §4 specify the side-effect sequences. |
| 2. Sign-out token invalidation behavior (7.6) — architect confirmation | ✓ Resolved — architecture review §1 documents the token behavior (stateless JWT, boundary JWT not explicitly invalidated, ActiveUserGuard per-request lookup, acceptable for MVP). |
| 3. PRD additions (FR-20, FR-21) — PM sign-off | ✓ Resolved — PRD frontmatter `updated: 2026-07-16`, FR-20 and FR-21 are present in §§4.5 and 4.1. |
| 4. EXPERIENCE.md amendments — UX Designer sign-off | ✓ Resolved — EXPERIENCE.md frontmatter `updated: 2026-07-16`, all 7 amended sections present with "Amendment 2026-07-16" markers. |
| 5. Full conversation list surface choice (7.14) — modal vs. route | ✓ Resolved — UX spec §Show All specifies modal "chosen over a dedicated `/conversations` route for MVP simplicity." |

All 5 pre-implementation blockers from the proposal have been resolved in the downstream artifacts.

---

## Recommendations

### Before sprint execution begins (non-blocking, should resolve)

1. **Update PRD §8** to reflect FR-20 (avatar is a dropdown menu trigger, not a plain link to `/settings`) and FR-21 (Settings contains a Repository section with a Disconnect action, not an empty "coming soon" page). Add an amendment note dated 2026-07-16.

2. **Append FR-11 clarifying note** to the PRD referencing the conversation delete capability (Story 7.11) — the proposal specified this; it was not applied.

3. **Append the 9 missing `sprint-status.yaml` entries** for stories 7.6–7.14 (all `backlog`) and update the Epic 7 comment block to reflect the extension to 14 stories.

### Implementation order (per wave sequencing)

1. **Wave 1 — 7.6 then 7.7, then 7.8 and 7.9.** 7.6 (avatar dropdown) must precede 7.7 (repo disconnect) because the avatar dropdown's "Settings" link is the path to the Settings page once the avatar is no longer a direct link. 7.8 (intro prompt) and 7.9 (empty state) are independent trivial wins that ride along.

2. **Wave 2 — 7.10, then 7.11 and 7.12 together.** 7.10 (404 page) is independent. 7.11 (delete) and 7.12 (rename) both touch side-nav conversation interactions and should be implemented together.

3. **Wave 3 — 7.13 and 7.14.** Scale features; design patterns are now specified. 7.14 has a soft dependency on 7.5 (relative timestamps) with a documented fallback.

### Cleanup (informational)

4. **Remove the duplicate `status: draft` key** from the PRD frontmatter (line 3) — the effective status is `approved` (line 6).

5. **Consider appending the architecture review notes to `architecture.md`** as the proposal §4.6 suggested, or update the proposal to document that the standalone review document is the canonical location. The stories reference "architecture review §X" which resolves to the standalone document, so this is not blocking.

---

## Final Note

This assessment identified **3 non-blocking issues** and **3 informational observations** across the 9 stories in the Epic 7 extension. All 5 pre-implementation blockers flagged in the sprint change proposal have been resolved in the downstream artifacts. The story specs are self-sufficient — each contains specific, testable Given/When/Then acceptance criteria, correct UX spec references (verified by cross-check), correct PRD FR references (where applicable), and correct architecture review references (where applicable).

The 3 non-blocking conditions (PRD §8 stale text, missing FR-11 note, missing sprint-status.yaml entries) are documentation and tracking gaps that should be cleaned up for artifact consistency, but none prevent a developer from picking up any of the 9 stories and beginning implementation immediately.

**Assessor:** Implementation Readiness Reviewer (automated)
**Date:** 2026-07-16
**Target:** Epic 7 extension — Stories 7.6–7.14 (UX dead-ends and missing maintenance surfaces)
