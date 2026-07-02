# Spine Pair Review — bmad-easy

## Overall verdict

The spine pair is largely sound as a downstream contract: all four `sources:` paths resolve, every DESIGN.md token referenced in prose is defined, section ordering matches the canonical shape in both files, and the three PRD User Journeys map cleanly to three named-protagonist Key Flows. Two categories of real gaps keep this from "strong" across the board: (1) a stale `key-signin.html` mock that reintroduces a Sign In/Sign Up tab pattern the decision log explicitly resolved away, and (2) two PRD-mandated states (seat-limit and concurrent-conversation-limit) that are entirely absent from EXPERIENCE.md's State Patterns and Key Flows. Neither is fatal, but both would cause a downstream builder (human or AI) to either build the wrong sign-in screen or silently skip two testable FRs.

## 1. Flow coverage — strong

Checked PRD §2.3 (UJ-1, UJ-2, UJ-3) against EXPERIENCE.md Key Flows 1–3. Each PRD journey has a corresponding flow with a named protagonist (Sarah, preserved verbatim), numbered steps, an explicit `*(Climax)*` beat, and an edge/failure path where the PRD specifies one.

- UJ-1 → Flow 1 (Sarah Connects the Repository): entry state, path, climax, and edge case (`_bmad` not found) all present. EXPERIENCE.md adds a second edge path (org OAuth App restriction) that is present in PRD FR-1/§8 but not enumerated as a distinct edge case under UJ-1 itself — this is an enrichment, not a gap.
- UJ-2 → Flow 2 (Sarah Runs a PRD Skill and Sees It Committed): entry state, multi-turn path, climax (View → rendered PRD, author attribution), and edge case (working tree dirty at close) all present, matching PRD's "closes and returns later" edge case in spirit though reworded to focus on the unsaved-work disclosure rather than resumption. Resumption itself is covered separately under "Conversation Loading (Returning)" in State Patterns.
- UJ-3 → Flow 3 (Sarah Reads a Teammate's Artifact): entry state, path, climax, and an explicit "no edge case" note with a fallback load-failure treatment. Matches PRD's UJ-3, which itself has no edge case.

### Findings
- **low** UJ-1's edge case is a single bullet in the PRD ("`_bmad` not found ... She cannot proceed"); EXPERIENCE.md Flow 1 splits this into two edge paths (BMAD not found, org OAuth restriction), both legitimately sourced from PRD FR-1/FR-2/§8 but not literally "the UJ-1 edge case." (EXPERIENCE.md §Key Flows, Flow 1). *Fix:* none needed — this is accurate elaboration, not invention; flag only so a downstream reader doesn't assume UJ-1's edge case text is being quoted verbatim.

## 2. Token completeness — strong

Extracted every `colors.*` / `typography.*` / `rounded.*` / `components.*` reference used via `{path.to.token}` syntax in both DESIGN.md body and EXPERIENCE.md, and diffed against the DESIGN.md frontmatter.

- DESIGN.md body references: `colors.accent`, `colors.accent-fg`, `colors.border`, `colors.border-subtle`, `colors.caution`, `colors.negative`, `colors.negative-bg`, `colors.positive`, `colors.surface`, `colors.surface-raised`, `colors.text-1/2/3`, `rounded.lg`, and all 16 `components.*` names — every one resolves to a frontmatter key.
- EXPERIENCE.md references: `colors.accent`, `colors.bg`, `colors.caution`, `colors.caution-bg`, `colors.surface-raised`, `colors.text-1/2/3`, `typography.scale.sm`, `typography.scale.xs` — every one resolves to a frontmatter key (`typography.scale.*` and each `colors.*` entry both exist at DESIGN.md lines 7–35 and 40–47).
- All 5 color tokens used for semantic state (`positive`, `positive-bg`, `caution`, `caution-bg`, `negative`, `negative-bg`) have hex or rgba values in the frontmatter — no color token is missing a value.

### Findings
None.

## 3. Component coverage — adequate

Extracted every component name appearing in DESIGN.md's `components:` frontmatter, DESIGN.md's `## Components` section (13 subsections — note Messages covers both `message-user` and `message-agent`, and Artifact Cards covers `status-badge-in-progress`/`status-badge-completed` under one heading), and ESPERIENCE.md's `## Component Patterns` section (7 subsections).

| Component (frontmatter key) | DESIGN.md visual spec | EXPERIENCE.md behavioral spec |
|---|---|---|
| side-nav | Yes (§Side Navigation) | Yes (§Side Navigation, IA) |
| chat-input | Yes (§Chat Input) | Yes (§Chat Input Keyboard Behavior, Interaction Primitives) |
| message-user / message-agent | Yes (§Messages) | Yes (§Streaming Chat Messages, §Copy Behavior) |
| tool-pill | Yes (§Tool Pill) | Yes (§Tool Pills and Semantic Pills) |
| semantic-pill | Yes (§Semantic Pill) | Yes (§Tool Pills and Semantic Pills) |
| working-tree-indicator | Yes (§Working Tree Indicator) | Yes (§Working Tree Indicator, full save-confirmation flow) |
| avatar-circle | Yes (§Avatar Circle) | Implicit only — referenced as "Settings entry" in IA/Side Nav, no dedicated behavioral entry |
| artifact-card | Yes (§Artifact Cards) | **No dedicated Component Patterns entry** — only appears in State Patterns tables (Project Map States: "Populated → Artifact card list") |
| status-badge-in-progress / -completed | Yes (nested under §Artifact Cards) | Same as artifact-card — no dedicated behavioral entry; one line in Accessibility Floor ("uses a distinct label and badge border") |
| slash-command-picker | Yes (§Slash Command Picker) | Yes (§Slash Command Picker, real behavioral rules: filtering, keyboard nav, empty state) |
| scroll-to-bottom-button | Yes (§Scroll-to-Bottom Button) | Yes (§Scroll Behavior (Chat)) |
| stop-button | Yes (§Stop Button) | Yes (§Agent Processing States table) |
| copy-action | Yes (§Copy Action) | Yes (§Copy Behavior) |
| credential-error-banner | Yes (§Credential Error Banner) | Yes (§Credential Error Banner, real rules) |

### Findings
- **medium** `artifact-card` and its two status-badge variants have a full visual spec in DESIGN.md but no dedicated entry under EXPERIENCE.md's `## Component Patterns` — the only behavioral detail is "Status badge — in-progress or completed per DESIGN.md component specs" in the Artifact List pattern (EXPERIENCE.md line 179) and one line in Accessibility Floor (line 348). Click behavior, hover behavior, and click target (whole card vs. specific zone) for Artifact Cards on the Project Map are undocumented. *Fix:* add an "Artifact Card" row/subsection to Component Patterns specifying click behavior (does the whole card navigate, or just the title?), hover state, and how in-progress-with-open-Conversation vs. in-progress-without-open-Conversation click targets differ per PRD FR-8.
- **low** `avatar-circle` has no dedicated Component Patterns entry beyond being named as the Settings nav entry point. Its only behavior (click → navigate to `/settings`) is trivial enough that a table row may be overkill, but as written a downstream consumer must infer the click target from IA prose rather than a spec. *Fix:* one line under Side Navigation or a new "Avatar Circle" row confirming it's a single-click nav link with no dropdown/menu in MVP (Settings itself has no such menu, per §State Patterns).

## 4. State coverage — adequate

Walked all 7 IA surfaces against plausible states (empty, cold-load, error, loading, permission-denied, credential-failed, etc.).

- **Sign In:** cold-load, auth error. No permission-denied state needed (OAuth-only, no roles pre-auth). Strong.
- **Onboarding:** cold-load (step 1), validating, validation failure (3 named causes), BMAD-not-found, success. Strong — matches PRD FR-1/FR-2 consequences closely.
- **Project Map:** loading, empty, populated, credential-failed, refreshing. Strong — matches FR-4, FR-6, FR-7.
- **New Conversation:** cold entry (prompt shown), sandbox-provisioning-in-progress-at-send, draft persistence/restore. Strong — matches FR-9, FR-10 draft requirement.
- **Conversation:** cold-load, error (history load failure), reconnecting, active/idle, four agent-processing sub-states (idle/thinking/tool-executing/streaming). Strong — matches FR-10, FR-12, FR-13.
- **Artifact Browser:** list-only, list+detail, artifact-loading, artifact-load-error, credential-failed. Strong — matches FR-16, FR-17.
- **Settings:** explicitly states "No loading, empty, or error states required — content is platform copy only." Correctly minimal per PRD's "empty coming soon page" framing.

### Findings
- **high** No state or affordance exists anywhere in EXPERIENCE.md for the "session limit reached" condition (PRD FR-11: "Attempting to open a new Conversation beyond the limit shows a 'session limit reached' message rather than silently failing") or the "Seat allocation exceeded" upgrade-prompt condition (PRD FR-9: "Opening a new Conversation is blocked with a clear upgrade prompt for users who have exceeded their Seat allocation"). Neither term ("limit," "quota," "seat," "exceed") appears anywhere in EXPERIENCE.md. (Absent from EXPERIENCE.md §State Patterns → New Conversation, and absent from DESIGN.md — no component for this messaging exists either.) *Fix:* add a "Concurrent limit reached" state to New Conversation's state table (or a new row under Side Navigation's New Conversation button) and a "Seat limit exceeded" state, each specifying the message copy per the Voice and Tone conventions already established (plain language, no "quota" jargon) and where the message appears (inline in New Conversation page? toast? blocking modal?).
- **low** Credential-failed state is documented for Project Map and Artifact Browser (FR-4 scope) but not explicitly for the Conversation surface, even though FR-4 says credential failure can occur during any git operation, and Conversations perform git operations (commits). EXPERIENCE.md's Conversation Surface States table has no credential-failed row. *Fix:* clarify whether a credential failure mid-Conversation surfaces as an error-state Tool Pill (per FR-12's failed-tool-call pattern, which is documented) or needs its own banner treatment — currently ambiguous whether Conversation surface needs the Credential Error Banner too.

## 5. Visual reference coverage — thin

`.working/` contains 7 HTML key-screen mocks: `key-artifact-browser.html`, `key-conversation.html`, `key-new-conversation.html`, `key-onboarding.html`, `key-project-map.html`, `key-settings.html`, `key-signin.html` — one per IA surface, correctly named to match the 7 surfaces in EXPERIENCE.md's IA tables. `key-onboarding.html` was verified freshly updated (Jul 2, matching the `.decision-log.md` 2026-07-02 entry) to the single-field Repository-URL-only model, with no access-token field or "How to generate an access token" link remaining — text at line 385 of that file explicitly states "No token entry — write access is checked via the GitHub OAuth grant from sign-in," consistent with EXPERIENCE.md's Onboarding Flow States and Flow 1.

### Findings
- **high** `key-signin.html` (dated Jun 22, not updated alongside the Jul 2 onboarding fix) implements a "Sign In / Sign Up" tab toggle with a "Sign up free" link and an annotation reading "Sign up tab switches to registration variant (same GitHub OAuth CTA)" (`.working/key-signin.html` lines 269–273, 293–294, 315–318). This directly contradicts `.decision-log.md`'s resolved decision ("There is no separate sign-up screen ... `/sign-up` is removed. `/sign-in` serves both new and returning users") and EXPERIENCE.md's own Sign In section ("There is no separate sign-up screen ... `/sign-in` is the only unauthenticated surface," EXPERIENCE.md line 196). The spine prose is correct; the mock is stale — the same class of drift that was just caught and fixed for onboarding. *Fix:* remove the Sign In/Sign Up tab row and "Sign up free" link from `key-signin.html` before it is promoted out of `.working/`; a single "Sign in with GitHub" CTA with no tab affordance matches both the spine and the decision log.
- **low** The other five mocks (`key-artifact-browser`, `key-conversation`, `key-new-conversation`, `key-project-map`, `key-settings`) spot-checked for consistency with spine prose — artifact-browser's 280px list pane, project-map's completed/in-progress badges, conversation's working-tree-clean indicator, and settings' "coming soon" copy all match DESIGN.md/EXPERIENCE.md. No further staleness found, but these were not exhaustively diffed field-by-field against every state table row (e.g., the loading/error/reconnecting states for Conversation are not separately mocked — only one state per surface is typically shown in a "key screen" mock, which is expected for this artifact type).

## 6. Bloat & overspecification — adequate

### Findings
- **low** EXPERIENCE.md restates specific pixel values already defined in DESIGN.md's Layout & Spacing table (240px side nav, 280px artifact list pane, 760px chat max-width) at EXPERIENCE.md lines 46, 79, 182, 257, 411, rather than referencing `{layout.*}`-style tokens (DESIGN.md has no `layout` frontmatter section — these are prose-table values, not tokens, so no `{path}` reference syntax is available). This is mild duplication but is arguably load-bearing: each restatement gates a described layout-state transition (e.g., "list narrows to 280px" is the condition, not decoration). *Fix:* optional — if DESIGN.md's Layout & Spacing table were promoted to frontmatter tokens (e.g., `layout.sidebar-width`), EXPERIENCE.md could reference `{layout.sidebar-width}` instead of restating "240px," tightening the single-source-of-truth property. Not urgent; current duplication is low-risk since values match exactly everywhere checked.
- **low** DESIGN.md's Brand & Style section ("Personality keywords," "Reference aesthetic," "What this is not") and EXPERIENCE.md's Voice and Tone section both partially restate brief.md's positioning ("feels like AI chat tools... not an IDE," "no developer tooling required"). This is expected per the shape spec (Brand & Style is supposed to translate positioning into aesthetic posture) rather than pure restatement — no cut recommended.
- No sections found that a downstream consumer would never read; no pixel specs duplicated where a token already existed (all `{colors.*}`/`{rounded.*}` usages defer correctly to tokens rather than restating hex/px values inline); no decorative narrative untied to a decision — every prose passage in both files ties to a PRD FR, a decision-log entry, or an explicit `[ASSUMPTION]` tag.

## 7. Inheritance discipline — strong

### Findings
- **low** All `sources:` frontmatter paths in EXPERIENCE.md resolve to real files: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`, `_bmad-output/planning-artifacts/briefs/brief-bmad-easy-2026-06-12/brief.md`, `_bmad-output/planning-artifacts/architecture.md` — verified present on disk. No broken references. (Originally also listed `_bmad-output/navigation.md`, since deleted after its content was fully merged into EXPERIENCE.md.)
- User Journey protagonist ("Sarah") and journey descriptions are preserved verbatim/near-verbatim from PRD §2.3 into EXPERIENCE.md Key Flows (persona, company size, entry state language all match).
- Glossary (developer vocab → platform vocab) in EXPERIENCE.md's Voice and Tone table is internally consistent with usage throughout both documents: "Sandbox provisioning → Starting session," "Working tree dirty → Unsaved changes," "PAT/Personal Access Token → Access token," "`_bmad-output/` → (not surfaced)" are all applied correctly in the State Patterns and Key Flows sections (e.g., "Starting session…" used correctly at EXPERIENCE.md lines 210, 395; no raw "sandbox" or "commit" language leaks into user-facing copy anywhere in Key Flows or State Patterns tables).
- Component names match exactly across DESIGN.md frontmatter keys, DESIGN.md `## Components` subsection headers, and EXPERIENCE.md `## Component Patterns` subsection headers, with one cosmetic exception noted below.
- EXPERIENCE.md's `{colors.*}` / `{typography.*}` references all resolve to real DESIGN.md tokens by name (see §2 above — no orphaned references).

### Findings (continued)
- **low** DESIGN.md's frontmatter/heading uses `Artifact Cards` (plural, §Components) while its own token key is singular `artifact-card`; EXPERIENCE.md uses "Artifact List" as its pattern heading and refers to individual rows as "entries," not "cards," in the Artifact Browser context (EXPERIENCE.md §Artifact List (Artifact Browser)), while its Project Map States table calls the same visual unit "Artifact card." This is a minor naming inconsistency (card vs. entry) between the Artifact Browser's flat list rows and the Project Map's cards — they are visually and behaviorally different components (Browser rows vs. Project Map cards) but the naming doesn't make that distinction explicit anywhere. *Fix:* clarify in EXPERIENCE.md whether "Artifact List" entries (Artifact Browser) and "Artifact Cards" (Project Map) are the same component in two contexts or two distinct components — currently readers must infer this from context (DESIGN.md's `artifact-card` token is only invoked by name for the Project Map context, per DESIGN.md line 352 "Artifact Cards (Project Map)").

## 8. Shape fit — strong

### Findings
- DESIGN.md sections appear in exactly the canonical order: Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts. All 8 sections present, none omitted, none reordered.
- EXPERIENCE.md's 8 required sections are all present and in the canonical order: Foundation → Information Architecture → Voice and Tone → Component Patterns → State Patterns → Interaction Primitives → Accessibility Floor → Key Flows. No omissions, no reordering.
- No findings — both files match the reference shape precisely, including subsection depth and table-vs-prose balance comparable to the shadcn and mobile example spines.

## Mechanical notes

- Frontmatter completeness: DESIGN.md frontmatter is complete for all tokens referenced in prose (colors, typography, rounded, spacing, components) — no missing keys, no color token missing a hex/rgba value. EXPERIENCE.md frontmatter (`title`, `status`, `created`, `updated`, `sources`) is minimal but complete for its purpose; it lacks a `name`/`status: final` pairing seen in the shape-reference examples (both spines here use `status: draft`, which is consistent within the pair but means this is not yet a finalized contract — worth confirming with the author whether `draft` is intentional at this review stage).
- No broken cross-references found: every `{colors.*}`, `{typography.*}`, `{rounded.*}`, and `{components.*}` reference in both files resolves to a real DESIGN.md frontmatter key.
- No name inconsistencies found for the 14 non-artifact-card components; the one soft inconsistency is the Artifact Card / Artifact List / Artifact entry naming drift noted in §7.
- The stale `key-signin.html` mock (§5) is the most actionable mechanical finding: it is trivial to fix (delete ~6 lines) and blocks confident promotion of that mock out of `.working/`.
- FR-9 (seat limit) and FR-11 (session limit) coverage gap (§4) is the most consequential finding for downstream story-dev: a developer building New Conversation from EXPERIENCE.md alone would not know these two blocking states exist, despite both being testable PRD consequences.
