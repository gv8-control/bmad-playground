# PRD Quality Review — bmad-easy

## Overall verdict

This is a strong PRD. The Vision has a specific thesis, features track cleanly to user journeys, FRs carry testable consequences, and NFRs have actual thresholds. The main risks are a missing success metric for SM-4 (a gap in the numbered sequence), a single open question where the architect owns an unresolved constraint boundary, and a few FRs where "done" is partially delegated to the UX spec without a firm interim proxy.

---

## Decision-readiness — strong

The PRD surfaces trade-offs explicitly and doesn't paper over them. The PAT onboarding friction is named as "a known activation friction point" with a documented post-MVP trigger (§4.1, §6.2); the main-branch-only constraint is called a "conscious scope decision" with last-write-wins acknowledged as a known failure mode (§8); agent-initiated commit failure is explicitly classified as "a known silent failure mode in MVP" (§5). These are real decisions, not considerations dressed as decisions.

Open questions are honest: Q-1 acknowledges an unvalidated NFR-P2 boundary and assigns the action to the architect before the architecture document is finalized. That is an open question doing real work.

The NOTE FOR PM callout in §6.2 on the GitHub App integration gives concrete guidance (fast-track based on trial activation data) rather than a safe hedge. The post-MVP usage-based pricing note in §10 is correctly framed as a V2 concern without over-engineering the MVP.

One thin spot: the single-container backend constraint (§8) is stated plainly, but the trade-off given up — limited burst capacity, no horizontal scaling — is not named as a decision with a specific consequence if usage spikes at launch. This matters given the competitive window framing in §9.

### Findings
- **low** Missing trade-off on single-container constraint (§8) — The "conscious scope decision" label is correct but the decision's blast radius (no burst handling, single point of failure at launch) is not named. A PM or investor reviewer would want to see this named, not inferred. *Fix:* Add one sentence naming the consequence: e.g., "If burst usage at launch saturates the container, new Conversation opens will queue or fail; the documented mitigation is monitoring-triggered vertical scale."

---

## Substance over theater — strong

The Vision statement earns its space. "Make BMAD feel like a tool that was built for PMs as much as it was built for developers" (§1) is not generic — it frames a specific inversion, and every major feature (Project Map, Semantic Pills, non-dev-readable Artifact Browser) can be traced to it. The Vision could not swap into a generic SaaS PRD in this category without change.

Three user roles (§2.1) map to distinct Jobs To Be Done and distinct purchase mechanics. This is not persona theater — the developer champion drives internal evaluation, the buyer approves the purchase, the primary user generates the retention signal. Each drives at least one downstream requirement (FR-9's Seat limit enforcement, SM-5's VP/Director conversion metric).

The Why Now section (§9) is grounded in specifics: 49,000 GitHub stars, 5,680 forks, Claude Code Web launch date, competitive window calculation. This is not trend-surfing — it's a timing argument with measurable inputs.

NFRs are product-specific (§7): latency figures have exact millisecond targets, the SSE back-pressure NFR (NFR-R3) calls out a specific failure mode, NFR-S2 calls out specific credential categories that must not enter the Sandbox. No copied boilerplate.

Minor: the Monetization section's cost modelling (§10) includes session cost estimates by session type with specific pricing inputs. This is earned substance, not theater.

### Findings
- **low** NFR-S1 is missing (§7, Security) — The security NFRs are numbered S2 through S5 with no S1. Either a requirement was removed without renumbering, or the sequence started at S2 intentionally. *Fix:* Either renumber S2–S5 to S1–S4, or add a note stating S1 was intentionally omitted and why.

---

## Strategic coherence — strong

The PRD has a clear thesis: BMAD's access layer is broken for non-devs; bmad-easy fixes the access layer without changing the methodology. Every scoped feature serves this directly. The Project Map makes BMAD state visible without a git client. Conversations replicate the CLI agent experience without a terminal. The Artifact Browser renders output without GitHub's file-navigation interface.

Feature prioritization follows from the thesis, not from implementation convenience. Branching/PR workflows (post-MVP) would be convenient for developers but don't serve the non-dev access thesis. PM tool integrations (post-MVP) are acknowledged as important but out of scope because they require cross-system work that doesn't serve the core problem.

Success metrics validate the thesis correctly. SM-1 (unassisted session completion) validates that non-devs can operate the tool without a developer intermediary — this is the thesis's testable consequence. SM-2 (repeat rate) validates that the tool is not a one-time exercise. Counter-metrics SM-C1 and SM-C2 are well-chosen: they prevent optimizing for session duration (which would contradict the "equal participant, not dependent" thesis) and seat growth without activation.

One gap: SM-4 is missing from the Success Metrics section. The sequence jumps from SM-3 to SM-5. Whether this is a renaming artifact or a deleted metric is unclear.

### Findings
- **medium** Missing SM-4 (§11) — The Success Metrics sequence is SM-1, SM-2, SM-3, SM-5, SM-6, with no SM-4. If SM-4 was intentionally removed, the remaining metrics should be renumbered. If it was accidentally omitted, the gap signals a missing validation signal. *Fix:* Either renumber SM-5 and SM-6 to SM-4 and SM-5, or document what SM-4 was and confirm it was intentionally removed.

---

## Done-ness clarity — adequate

The majority of FRs carry testable consequences with specific, verifiable conditions. FR-1 specifies the exact error conditions on validation failure (invalid PAT / wrong scope / no repository access). FR-10 gives the exact latency target (1,500 ms first token), exact interaction model (Enter submits, Shift+Enter newlines), and exact scroll behavior. FR-14's status indicator specifies the label text, color, and state transitions. FR-15 specifies the exact commit message format, the no-op behavior on a clean working tree, and the queuing behavior when an agent turn is in progress.

However, three FRs partially defer done-ness to downstream specs:

FR-16 (Artifact Browser) delegates Artifact ordering to the UX spec: "Artifact ordering in the list is to be determined by the UX spec." This is reasonable for a UX concern, but it creates a dependency: the UX spec must exist before an engineer can implement the Artifact list. If the UX spec does not exist at build time, this FR is incomplete.

FR-3 (Commit Attribution) states commits are attributed to "the user's platform identity (name and email)" without specifying where the platform gets the user's email — from GitHub OAuth claims, from a profile field, or hardcoded as the platform account email. This is observable behavior in git history.

FR-18 (Authentication) defers session lifetime with an explicit NON-GOAL callout: the platform "accepts whatever the authentication provider or framework default provides." This is an honest deferral, but a framework default session lifetime can range from 15 minutes to indefinite; engineering will need to pick a value, and the PRD gives no preference signal.

### Findings
- **medium** Commit attribution identity source unspecified (§4.1 FR-3) — FR-3 states commits are attributed to "the user's platform identity (name and email)" but does not specify the data source for the email field. If the user's platform identity email differs from their GitHub account email, commits may show inconsistent authorship. *Fix:* Specify that the email used in git author/committer is drawn from the GitHub OAuth profile claim, or note if a separate platform profile field is used.
- **low** Artifact Browser list ordering deferred (§4.4 FR-16) — "Artifact ordering is to be determined by the UX spec" creates a hard dependency on a downstream spec for an implementable FR. *Fix:* Add a default ordering (e.g., "most recently committed first") as the fallback if the UX spec does not specify otherwise. This unblocks implementation without constraining the UX designer.
- **low** Session lifetime not bounded (§4.5 FR-18) — The NON-GOAL deferral is honest, but "whatever the framework default provides" is a range of 15 minutes to indefinite. If session lifetime turns out to be 15 minutes, non-dev users mid-conversation will be logged out. *Fix:* Add a preference signal: e.g., "session lifetime should be at least 8 hours to allow within-day return to in-progress Conversations; exact duration is not constrained."

---

## Scope honesty — strong

Non-Goals (§5) are specific and do each name something that a reader could reasonably have assumed was in scope. "BMAD initialization" names a common confusion point — users who arrive at the platform expecting it to set up BMAD. "Agent-initiated commit failure handling" is unusually honest: it explicitly names a silent failure mode and explains why it's deferred.

The Assumptions Index (§13) is maintained: seven assumptions, all with inline tags, all indexed with section references. Two resolved assumptions (A-4, A-5) are marked with strikethrough, which is a correct practice for traceability.

The 6.2 Out of Scope list is specific about post-MVP triggers: GitHub App integration trigger is "PAT friction identified as material activation blocker in beta." Non-GitHub provider trigger is "paying customer with an explicit requirement." These are decision criteria, not vague aspirations.

The conflict detection gap (§6.2: "last-write-wins with no user warning") is explicitly acknowledged in Out of Scope, not silently omitted.

No significant gaps found.

---

## Downstream usability — strong

The Glossary (§3) is well-constructed and used consistently. Domain nouns are capitalized consistently: Conversation, Agent, Artifact, Repository, Sandbox, Skill, Project Map, Artifact Browser, Seat, PAT, Runner. No synonyms were detected in the FRs or UJs.

FR/UJ/NFR IDs are contiguous with the exception of SM-4 (noted above under Strategic coherence) and the NFR-S1 gap (noted under Substance over theater). FR IDs 1–19 are contiguous. UJ-1 through UJ-3 are contiguous.

Each UJ has a named protagonist (Sarah), carries context inline about her role and entry state, and maps to one or more FRs. UJ-2 maps to FR-9, FR-10, FR-12; UJ-3 maps to FR-8, FR-16. These cross-references resolve.

The Artifact Browser's layout description (FR-16) introduces "single page with two layout states" which is a clear UX contract for the designer. The side navigation panel layout is specified in §8 (Constraints) rather than in the Navigation feature, which is an unusual location but the content is substantive: 5 Conversations, semantic labels, link structure, Settings placeholder.

The PRD explicitly signals its relationship to downstream: "The UX spec and architecture document, when produced, build on this PRD and do not need to reproduce its contents" (§0). This is correctly framed.

### Findings
- **low** Side navigation specification in Constraints (§8) — Navigation model is substantive UX spec content (5 conversations, semantic labels, breadcrumb model) embedded in §8 Constraints rather than in a Features or Navigation section. The architect and UX designer will need to read §8 to find this. *Fix:* Move navigation model to §4 or add a cross-reference in §8 pointing to wherever UX navigation will be documented.

---

## Shape fit — strong

This is a consumer-facing SaaS product for non-developer knowledge workers with meaningful UX requirements. The PRD shape is correct for that: three named UJs with protagonists, a clear persona hierarchy, and a vision-led feature set. UJs are not overhead here — they are the primary load-bearing structure.

The PRD is chain-top: it explicitly states it feeds a UX spec and architecture document (§0). The downstream usability dimension appropriately carries more weight here. The traceability between UJs and FRs is sufficient for that handoff.

The product is greenfield SaaS with no brownfield codebase concerns, which the PRD reflects correctly. Existing-code references are absent, as they should be.

The PRD correctly avoids over-formalization: no regulatory constraint traceability matrix, no formal acceptance criteria section, no story mapping. The testable consequences in each FR serve as the acceptance criteria proxy, which is appropriate at this stage.

No shape misfit found.

---

## Mechanical notes

**Glossary drift:** None detected. Capitalized terms (Conversation, Agent, Artifact, Repository, Sandbox, Skill, Project Map, Artifact Browser, Seat, PAT, Tool Pill, Semantic Pill, Runner) are used consistently across all sections.

**ID continuity:** FR-1 through FR-19 are contiguous. UJ-1 through UJ-3 are contiguous. NFR-S2 through NFR-S5 (no NFR-S1), NFR-P1 through NFR-P5, NFR-R1 through NFR-R4, NFR-O1. SM-1 through SM-3, then SM-5 and SM-6 (no SM-4), SM-C1 and SM-C2.

**Assumptions Index roundtrip:** Seven inline `[ASSUMPTION]` tags (A-1 through A-7) all appear in §13. A-4 and A-5 are marked resolved with strikethrough. All index entries have inline tags; no orphans detected.

**UJ protagonist naming:** All three UJs carry "Sarah" as the named protagonist with context inline. Clean.

**Required sections:** All sections present and substantively populated for a chain-top greenfield SaaS PRD at this stake level.
