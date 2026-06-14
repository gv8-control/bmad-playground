# Validation Report — bmad-easy

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-14/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-14/EXPERIENCE.md`
- **Run at:** 2026-06-14T00:00:00Z

## Overall verdict

The spine pair is substantially complete and architecturally sound. DESIGN.md is well-disciplined for a shadcn brand-delta document, and EXPERIENCE.md covers the behavioral contract with real depth and precision across states, interaction primitives, and accessibility. The main risks are (1) EXPERIENCE.md's composition-reference links resolve to paths that do not exist in the workspace, making them unverifiable and potentially orphaned, (2) several components appear in both spines under names that are nearly — but not exactly — identical, and (3) the accessibility floor makes a contrast claim against `{colors.primary}` and `{colors.accent}` that is stated but not verified in DESIGN.md, which is the authoritative source for contrast data. These are addressable before handoff to architecture and story-dev without a full rework.

## Category verdicts

- Flow coverage — adequate
- Token completeness — strong
- Component coverage — adequate
- State coverage — strong
- Visual reference coverage — **broken**
- Bloat & overspecification — strong
- Inheritance discipline — adequate
- Shape fit — strong

## Findings by severity

### High (1)

**Visual reference coverage** — Four composition reference links resolve to nonexistent files (`EXPERIENCE.md` line 35)
EXPERIENCE.md references `.working/onboarding.html`, `.working/project-map.html`, `.working/skill-session.html`, `.working/artifact-browser.html`. None exist. Downstream consumers will attempt to find them and fail.
Fix: If the files do not exist yet, replace the reference line with: "Composition references: to be added (onboarding, project-map, skill-session, artifact-browser). Spine wins on conflict when added." If in progress, move to `imports/` and update the path.

### Medium (9)

**Flow coverage** — Save Checkpoint interaction missing from all flows (`EXPERIENCE.md — Key Flows, Flow 2`)
Flow 2 omits the Working Tree State Indicator / Save Checkpoint interaction (FR-18/FR-19/FR-20). No user path shows Sarah noticing "● Unsaved changes", triggering a checkpoint, and seeing the platform-checkpoint Commit Pill.
Fix: Add Flow 5 (or extend Flow 2 with a branch) showing dirty-tree → Save Checkpoint → checkpoint Commit Pill sequence.

**Token completeness** — Contrast claim in EXPERIENCE.md not verified in DESIGN.md (`EXPERIENCE.md — Accessibility Floor; DESIGN.md — Colors`)
EXPERIENCE.md states "{colors.primary} and {colors.accent} verified to maintain WCAG AA." DESIGN.md has no contrast annotation. `{colors.accent}` (#EA5C1E) on white is ~3.1:1 — AA for large text only.
Fix: Add a contrast table to DESIGN.md Colors listing load-bearing combinations. Flag accent/white as large-text-only if that holds at final hex.

**Component coverage** — Save Checkpoint confirmation UI has no visual spec (`EXPERIENCE.md — Component Patterns; DESIGN.md — Components`)
The inline confirmation UI is described behaviorally but has no visual spec. Story-dev cannot know whether this is a Dialog, inline form, popover, or confirm/cancel pair.
Fix: Add a visual spec to DESIGN.md Components for `save-checkpoint-confirmation` or explicitly state it inherits shadcn `AlertDialog`.

**Component coverage** — `session-status-provisioning` has no frontmatter entry (`DESIGN.md — frontmatter, Components prose`)
Described in prose ("shadcn spinner + 'Starting session…' in Geist Sans muted") but no frontmatter entry. The other two Session Status states have frontmatter.
Fix: Add `session-status-provisioning: { label-font: 'Geist Sans', color: 'hsl(var(--muted-foreground))' }` to frontmatter.

**State coverage** — Artifact Browser missing load-failure state (`EXPERIENCE.md — State Patterns, Artifact Browser`)
No state defined for when an artifact cannot be loaded (git read failure, artifact path deleted, network error). Loading state covered; failure state absent.
Fix: Add row: "Artifact load failure | Artifact Browser | Muted inline error: 'This artifact could not be loaded.' Link: '← Project Map'. No retry affordance."

**State coverage** — Onboarding missing loading state between Connect click and validation result (`EXPERIENCE.md — State Patterns, Onboarding`)
Flow 1 describes a Skeleton state during validation, but it appears only in Key Flows narrative — not in State Patterns.
Fix: Add row: "Validating PAT + repository | Onboarding | Inline shadcn Skeleton / spinner on Connect button. Button disabled while validation in progress."

**Visual reference coverage** — No visual references exist for any of the six IA surfaces (`mockups/, wireframes/, imports/ — all empty or absent`)
The Skill Session layout (Thinking Indicator, Tool Indicator, Working Tree State Indicator, Stop Button, chat input with multiple affordances) is complex enough that a layout reference would reduce interpretation divergence.
Fix: A low-fidelity annotated sketch or ASCII layout of Project Map and Skill Session surfaces would anchor the composition for story-dev.

**Inheritance discipline** — Key Flow names don't match PRD UJ identifiers (`EXPERIENCE.md — Key Flows; PRD — UJ-1, UJ-2, UJ-3`)
EXPERIENCE.md uses "Flow 1–4." PRD uses "UJ-1–3." Story-dev tracing a ticket to source must manually align these.
Fix: Either name flows "Flow 1 — UJ-1: Repository connection" (append UJ code) or add a mapping note at the top of Key Flows.

**Inheritance discipline** — Token reference style inconsistent within EXPERIENCE.md (`EXPERIENCE.md — Accessibility Floor vs. all other sections`)
Accessibility Floor uses `{colors.primary}` and `{colors.accent}` token syntax. All other color references use plain English. Signals incomplete adoption of the cross-spine token system.
Fix: Pick one approach and apply consistently across all of EXPERIENCE.md.

### Low (10)

**Flow coverage** — Flow 4 missing concurrent-session-limit failure path (`EXPERIENCE.md — Key Flows, Flow 4`)
Fix: Add one-line failure note: "If session limit reached: inline message replaces the start link; user must close an existing session first."

**Flow coverage** — Flow 3 has no failure path (`EXPERIENCE.md — Key Flows, Flow 3`)
Fix: Add failure note: "If artifact not found or read fails, show muted error in place of rendered content with a link back to Project Map."

**Token completeness** — `working-tree-indicator` uses Tailwind class name instead of token value (`DESIGN.md — frontmatter`)
`font: 'Geist Sans'` re-states the inherited default; `font-size: 'text-xs'` is a Tailwind class, not a token value.
Fix: Remove the `font` key and change `font-size: 'text-xs'` to a semantic note or px dimension.

**Token completeness** — `session-status-expired` missing font token reference (`DESIGN.md — frontmatter`)
Prose adds "Geist Mono" for label font; frontmatter entry is missing it.
Fix: Add `label-font: '{typography.mono.fontFamily}'` to the frontmatter entry.

**Component coverage** — Manual Refresh, Stop Button, Scroll-to-Bottom have no explicit visual spec (`DESIGN.md — Components`)
shadcn inheritance is the likely intent but is not stated.
Fix: Add one-liner: "Manual Refresh button, Stop Button, and Scroll-to-Bottom Button: shadcn Button (ghost/outline variant). No brand override."

**Component coverage** — Commit Pill EXPERIENCE.md row name doesn't match DESIGN.md frontmatter keys (`EXPERIENCE.md — Component Patterns; DESIGN.md — frontmatter`)
DESIGN.md has `commit-pill` and `commit-pill-checkpoint`; EXPERIENCE.md has a single "Commit Pill" row.
Fix: Add note in the EXPERIENCE.md Commit Pill row: "Two DESIGN.md frontmatter components: commit-pill (agent-initiated) and commit-pill-checkpoint (platform checkpoint)."

**State coverage** — Sandbox provision failure state not defined (`EXPERIENCE.md — State Patterns, Skill Session`)
Fix: Add row: "Sandbox provision failure | Skill Session | Error message: 'Session could not start. Try again or contact support.' Retry button + 'Back to Project Map' link. Chat input remains disabled."

**State coverage** — Chat textarea focus behavior not specified (`EXPERIENCE.md — State Patterns / Interaction Primitives`)
Focus behavior for the chat textarea (grows, border changes) is unspecified. Skill Launch Field focus is covered.
Fix: Either explicitly inherit shadcn focus behavior for all standard inputs, or add a brief note to Interaction Primitives.

**Inheritance discipline** — Save Checkpoint / Working Tree State Indicator / "Save control" — three names for related concepts (`EXPERIENCE.md — Foundation, State Patterns, Component Patterns; PRD — FR-19`)
Fix: Establish canonical name at the top of Component Patterns Save Checkpoint entry: "Save Checkpoint (triggered via Working Tree State Indicator when dirty; also referred to as 'the Save control' in PRD FR-19)."

**Shape fit** — Inspiration & Anti-patterns section absent (`EXPERIENCE.md — missing section`)
The product makes deliberate choices (no vim-style keyboard navigation, / slash-command convention from Claude Code) that are not documented. Without a UX workspace decision log, these are at risk of scope creep.
Fix: Add Inspiration & Anti-patterns section with 4–6 entries: what was borrowed and from where, and what was explicitly rejected.

**Bloat** — "Only if the working tree is dirty" stated twice in State Patterns (`EXPERIENCE.md — State Patterns, "Session approaching idle timeout"`)
Fix: Remove the second instance of the qualifier.

## Mechanical notes

- EXPERIENCE.md is missing `description` in frontmatter — minor, not required by spec, but present in DESIGN.md and example spines.
- No Mermaid diagrams present in either spine. Not required; no syntax to check.
- Cross-spine token references in EXPERIENCE.md (line 123) resolve correctly to DESIGN.md frontmatter.
- "Skill Launch Field" consistent across both spines. "Commit Pill" / "commit-pill" consistent. "Save Checkpoint" / "Working Tree State Indicator" / "Save control" — three names; see §7 finding.
- No `.decision-log.md` in UX workspace. Design decisions are not recorded; the PRD workspace has one but the UX workspace does not.

## Reviewer files

- `review-rubric.md`
