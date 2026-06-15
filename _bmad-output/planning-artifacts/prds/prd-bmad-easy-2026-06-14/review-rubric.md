# PRD Quality Review — bmad-easy

## Overall verdict

This is a well-earned PRD that a decision-maker can act on and an architect can build from. The thesis is specific and traceable through every feature, the trade-offs are named honestly (OAuth scope breadth, sandbox isolation, main-branch last-write-wins), and the FRs carry testable consequences throughout. The primary risks are thin done-ness on Sandbox failure handling and the concurrent-write user experience, and one performance target (NFR-P2) whose scope boundary is acknowledged but not formally closed before the architecture document is written.

---

## Decision-readiness — strong

The PRD surfaces trade-offs as decisions, not considerations. §4.1 names the `repo` scope over-breadth, states the accepted rationale, and documents the post-MVP escalation trigger. §8 names main-branch last-write-wins as a "known constraint, not an error condition." §6.2 lists post-MVP scope with trigger conditions, not aspirations. Open Questions (§12) contains one real open question with a named owner and a deadline.

Counter-metrics (SM-C1, SM-C2) counterbalance the primary metrics without being rhetorical. The "if this is not working" condition in §11 names a specific signal that forces a rethink before further growth.

### Findings

- **medium** NFR-P2 scope boundary not closed (§12 Q-1) — The open question is correctly flagged and owner-assigned, but it lands in the architecture document, not the PRD. If the architecture document has not yet been started, nothing prevents a build decision being made with NFR-P2's scope undefined. *Fix:* Add a sentence to §7 Performance noting that NFR-P2 applies to repositories under ~200 MB; the architect's task in Q-1 is to document the number, not to decide it.

---

## Substance over theater — strong

Personas are three (primary user, buyer, developer champion) and each drives distinct decisions: the primary user justifies the whole feature set; the buyer justifies the self-serve sales motion and $5K ACV threshold; the developer champion justifies the trial-and-internal-evaluation path. No persona exists only to populate the template.

The Vision (§1) is earned: it names a specific inversion ("make BMAD feel like a tool that was built for PMs as much as it was built for developers"), explains the structural cause of the current failure (access layer, not methodology), and distinguishes bmad-easy's defensible position from Claude Code Web. This Vision statement cannot swap into any other PRD in this category.

NFRs are product-specific throughout. NFR-S2 names what is and is not permitted inside the Sandbox. NFR-R3 and NFR-R4 name SSE-specific failure modes. NFR-O1 names per-user spend monitoring as a day-one operational requirement. No copied boilerplate.

The §9 "Why Now" section is grounded in specifics (49,000 GitHub stars, elapsed window time, Claude Code Web launch date) and the cost floor analysis in §10 is unusually concrete, directly informing the pricing decision.

### Findings

- **low** SM-4 is absent from the metrics list (§11) — SM-1, SM-2, SM-3, SM-5, SM-6 are present; SM-4 does not appear and no note explains the gap. *Fix:* Either restore SM-4 or renumber SM-5 and SM-6 to SM-4 and SM-5 to avoid reader confusion in downstream story creation.

- **low** NFR-S1 is missing from the Security section (§7) — Security NFRs are numbered S2 through S5 with no S1. Either a requirement was removed without renumbering or the sequence started at S2 intentionally. *Fix:* Renumber S2–S5 to S1–S4, or add a note explaining the gap.

---

## Strategic coherence — strong

The thesis is legible: BMAD's team-wide methodology fails at the access layer; bmad-easy fixes that layer without changing the methodology. Every feature traces to the thesis — the Project Map makes BMAD state visible without a git client; commit attribution makes non-dev contributions peer contributions in git history; the Artifact Browser removes GitHub as a prerequisite for reading team output.

Feature prioritization follows from the thesis, not implementation convenience. Branching/PR workflows are post-MVP because they serve developers, not non-dev access. Real-time push detection is explicitly out of scope with a stated rationale.

SM-1 (unassisted session completion) validates the thesis's testable consequence: non-devs can run the methodology without a developer intermediary. SM-2 (session repeat rate) validates durability. The counter-metrics prevent optimizing for session duration or seat count over activation — both of which would contradict the thesis.

---

## Done-ness clarity — adequate

The FRs are substantially more testable than average. FR-10 gives an exact latency target, an exact interaction model, and exact scroll behavior. FR-14's status indicator specifies label text, color, and state transitions. FR-15 specifies the exact commit message format, the no-op behavior on a clean working tree, and the queuing behavior when an agent turn is in progress.

The weaknesses are clustered around error and recovery paths.

### Findings

- **high** Sandbox re-initialization recovery is not testable (§4.3 FR-13) — FR-13 states the platform handles re-initialization "transparently" and the user "sees a loading indicator." No condition defines when re-initialization is triggered, what the maximum wait is, or when the platform surfaces a hard failure instead of continuing to show a loading indicator. "Transparent" is not a testable condition. *Fix:* Add: what triggers a re-initialization attempt; a maximum wait duration before surfacing an error; and the user-visible state when re-initialization fails.

- **high** Concurrent-write last-write-wins has no user-visible consequence specified (§6.2 / §8) — The constraint is honestly named, but the PRD does not specify what the losing user sees. Is the earlier commit silently overwritten? Does the user whose commit "lost" receive any indication? *Fix:* Add a consequence: "The platform makes no attempt to detect or surface clobber events; the Repository git history reflects the last-committed state; the earlier committing user receives no notification."

- **medium** FR-3 commit attribution identity source unspecified (§4.1 FR-3) — FR-3 states commits are attributed to "the user's GitHub OAuth identity (name and primary email as returned by the GitHub OAuth profile claim)." This is clear on where name comes from but does not specify behavior when the GitHub OAuth profile has no public primary email. *Fix:* Add: what happens when the GitHub OAuth profile returns no email — whether a fallback identity is used, the commit is blocked, or a placeholder email is generated.

- **medium** FR-12 agent tool call failure does not specify Agent behavior after failure (§4.3 FR-12) — "the failure appears in the chat stream as an error-state Tool Pill" is testable, but the PRD does not specify whether the Agent continues after a tool call failure, stops and waits, or requires user input before the next turn. *Fix:* Add: whether the Agent continues its turn after a tool call failure or pauses; and whether the user must take action (e.g., resend, stop and restart) before the session continues.

- **low** FR-16 Artifact ordering deferred to UX spec (§4.4 FR-16) — "Artifact ordering in the list is to be determined by the UX spec" creates a hard dependency on a downstream spec for an otherwise implementable FR. *Fix:* Add a default ordering (e.g., "most recently committed first") as the fallback if the UX spec does not specify otherwise. Mark the deferral as `[NOTE FOR PM]`.

---

## Scope honesty — strong

Non-Goals (§5) are specific: eleven named exclusions, each one a real omission a reader could assume was included. "BMAD initialization," "terminal or IDE access," and "artifact editing" are all plausible inclusions that are explicitly excluded.

The §6.2 post-MVP list specifies trigger conditions (not vague aspirations) for each deferred item: GitHub App integration trigger is org OAuth restriction failures or a security posture review; non-GitHub provider trigger is a paying customer with an explicit requirement.

The Assumptions Index (§13) is maintained: all inline `[ASSUMPTION]` tags are indexed; two resolved assumptions are marked `~~RESOLVED~~` with references to the resolving FR.

### Findings

- **low** `[NON-GOAL for MVP]` tag at FR-18 session lifetime conflates non-goal with deferred decision (§4.5 FR-18) — The inline tag reads as a non-goal when the underlying concern is a deferred decision (what session lifetime is acceptable). A session lifetime of 15 minutes is within the space of "framework defaults" and would produce a poor experience for users mid-Conversation. *Fix:* Replace the `[NON-GOAL for MVP]` tag with `[NOTE FOR PM]` and add a preference signal: session lifetime should be at least 8 hours to allow within-day return to in-progress Conversations.

---

## Downstream usability — strong

The Glossary (§3) is tight: eleven terms, each defined once, with a stated commitment that no synonyms are used elsewhere in the document. A check confirms the commitment holds — "Conversation," "Artifact," "Sandbox," "Tool Pill," and "Semantic Pill" appear identically across §4, §6, and §11.

FR IDs are globally numbered (FR-1 through FR-19) and contiguous. UJs are named (UJ-1 through UJ-3), each with a named protagonist, and each marked with "Realizes" at the relevant feature description. SM IDs have one gap (SM-4 missing, noted under Substance).

§0 Document Purpose names the downstream audiences and explicitly states that the architecture document and UX spec "build on this PRD and do not need to reproduce its contents" — a useful scope boundary for downstream authors.

### Findings

- **low** Side navigation specification located in Constraints (§8), not in Features — Navigation model is substantive UX spec content (5 Conversations in side nav, semantic labels, breadcrumb model, Settings placeholder) embedded in §8 rather than in a Features section. The UX designer will need to read §8 to find this. *Fix:* Move navigation model to §4 or add a cross-reference in §8 pointing to wherever the UX navigation spec will be documented.

---

## Shape fit — strong

bmad-easy is a consumer-facing SaaS product with meaningful UX and a multi-stakeholder user model. The PRD shape is correct for that: three named UJs with protagonists, a clear persona hierarchy, and a vision-led feature set. UJs are load-bearing here, not overhead.

The PRD is chain-top (explicitly stated in §0: it feeds a UX spec and architecture document). Downstream usability carries appropriate weight and the traceability between UJs and FRs is sufficient for that handoff.

The product is greenfield SaaS with no brownfield codebase concerns, which the PRD reflects correctly. The PRD correctly avoids over-formalization: no regulatory constraint traceability, no formal acceptance criteria section. The testable consequences in each FR serve as the acceptance criteria proxy, which is appropriate at this stage.

---

## Mechanical notes

**Glossary drift:** None detected. Spot-checked "Tool Pill," "Semantic Pill," "Conversation," "Artifact," "Sandbox," "Repository," "Skill," "Project Map" across §4 and §11 — all consistent with §3 definitions.

**ID continuity:** FR-1 through FR-19 are contiguous. UJ-1 through UJ-3 are contiguous. NFR-S2 through NFR-S5 (NFR-S1 absent, no explanation). NFR-P1 through NFR-P5 contiguous. NFR-R1 through NFR-R4 contiguous. NFR-O1 present. SM-1 through SM-3, then SM-5 and SM-6 (SM-4 absent, no explanation). SM-C1 and SM-C2 present.

**Assumptions Index roundtrip:** All seven inline `[ASSUMPTION]` tags (A-1 through A-7) appear in §13. A-4 and A-5 are marked `~~RESOLVED~~` with references to the resolving FR. All index entries have matching inline tags; no orphans detected.

**UJ protagonist naming:** All three UJs carry "Sarah" as named protagonist with context inline. No floating UJs.

**Required sections:** All expected sections present and substantively populated for a chain-top greenfield SaaS PRD at this stake level.
