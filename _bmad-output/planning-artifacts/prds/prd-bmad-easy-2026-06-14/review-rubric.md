# PRD Quality Review — bmad-easy

## Overall verdict

This is a well-structured, production-grade PRD for an MVP. The vision is specific and earned, the FRs are unusually testable, and scope honesty is high — explicit non-goals, indexed assumptions with resolution status, and a decision log that explains what was deferred and why. The two meaningful risks are: (1) the success metrics rely on two measures (SM-4, SM-5) whose data collection paths are not defined, creating a phantom measurement plan; and (2) the Assumptions Index has a structural defect (A-11 missing, A-7 cross-references a non-existent FR-18) that must be corrected before the architect and UX designer extract from it.

---

## Decision-readiness — strong

The PRD names real trade-offs and does not smooth them to neutral. The PAT onboarding friction is called a "known activation friction point" at §4.1 with a `[NOTE FOR PM]` callout in §6.2 identifying it as "the single highest-impact UX improvement in Phase 2." The main-branch-only decision in §8 explicitly names the last-write-wins consequence and calls it "a known constraint, not an error condition for MVP." The single-container constraint in §8 names horizontal scaling as a post-MVP architectural change rather than burying it. The security NFRs (NFR-S1 through NFR-S6) name specific failure modes — memory isolation breach, tool escape — rather than generic "security must be good" language.

Open Questions (§12) declaring "No open questions remain" is the one decision-readiness weakness. An MVP at this specification level almost certainly has unresolved questions; the decision log shows several items were resolved on the same day the PRD was produced, which compresses the deliberation record. The more plausible reading is that some open items were classified as implementation details (e.g., Q-4: no repository size limit defined) rather than genuinely resolved. This is a defensible choice but should be named as a scope deferral, not a clean closure.

### Findings

- **medium** "No open questions remain" is implausible (§12) — The Repository size limit (Q-4 from decision log) was deferred without a threshold or a trigger for revisiting it. Under extreme cases a very large monorepo could affect Sandbox provisioning time and NFR-P2. The decision to defer is fine; closing the question without a threshold or owner is not. *Fix:* Re-open Q-4 with explicit language: "No Repository size limit is defined for MVP; Daytona provisioning time for Repositories > N GB is unvalidated against NFR-P2."

---

## Substance over theater — strong

The Vision statement (§1) is product-specific: it names the exact failure mode ("the methodology's team-wide promise breaks at the access layer"), the exact inversion being attempted, and the counterfactual (teams where non-dev colleagues are passengers). It would not survive transplant into a different PRD.

The personas (§2.1) are structured as Jobs To Be Done, not demographic profiles. The developer champion persona is the most notable — it exists because the internal evaluation → buyer conversion path requires it, and it drives the 14-day no-credit-card trial decision (§10) and the SM-5 metric.

NFRs have product-specific thresholds: 1,500 ms first token (NFR-P1), 10 seconds chat ready (NFR-P2), 2 seconds Project Map (NFR-P3), 2 seconds Artifact load (NFR-P4). The qualifier "verified with a single manual test run under normal conditions, not statistical sampling" is an honest admission of the NFR validation method, not boilerplate optimism.

### Findings

- **low** SM-4 (Artifact utilization) assumes a detection mechanism that does not exist (§11) — "referenced in a subsequent developer Skill Session or in team-external documents" cannot be measured without instrumentation for the external reference case. There is no FR that captures cross-tool artifact reference. If this metric cannot be measured, it should be marked as aspirational or replaced with a proxy. *Fix:* Add a note to SM-4: "External reference measurement requires manual sampling or instrumentation not in MVP scope; proxy: percentage of platform Artifacts that appear in any git diff in the same Repository within 30 days."

---

## Strategic coherence — strong

The PRD has a legible thesis: BMAD's team-wide methodology fails at the access layer; bmad-easy fixes the access layer without changing the methodology. Every feature follows from this thesis. The Project Map exists to give non-dev users their own home screen in the methodology. The Artifact Browser exists so they can read output without a GitHub interface. The Commit Pill exists to close the loop between chat and committed artifact without leaving the platform. Nothing in the feature list is "what's easy first" — the Skill Execution section (FR-9 through FR-13) is the most complex feature set and is prioritized because it is the thesis, not because it is cheap.

Success metrics connect to the thesis correctly. SM-1 (unassisted session completion) directly validates the access-barrier claim. SM-2 (session repeat rate) validates invitation versus one-time exercise. SM-3 (team activation rate) validates team fit. Counter-metrics are named and their counterbalance relationships are explicit.

The "Why Now" section (§9) names a competitive window — Claude Code Web's launch defines both the validation and the encroachment timeline — and quantifies it at 12–24 months. The monetization section (§10) explains the pricing anchors rather than asserting a number.

### Findings

- **medium** SM-5 (VP/Director buyer conversion) is a milestone condition dressed as a metric (§11) — "at least one paying team includes a Director or VP-level buyer" within 6 months is binary and untargeted: it says nothing about whether the GTM model is working or just got lucky with one buyer. *Fix:* Replace or supplement with a ratio metric: "Percentage of paying accounts where the buyer holds a Director or VP-equivalent title, target ≥ 30% within 6 months." The binary milestone can remain as a failure alarm alongside it.

---

## Done-ness clarity — strong

This is the PRD's strongest dimension. The "Consequences (testable)" pattern is applied consistently across all 17 FRs and produces verifiable outcomes for almost every requirement. Sampling:

- FR-1: "Platform validates that the PAT grants write access … before completing setup." Testable.
- FR-3: "Commits from two different users on the same Repository show different author identities in git history." Testable and specific.
- FR-10: "First streamed token appears within 1,500 ms of the user sending a message (satisfies NFR-P1)." Testable and cross-referenced.
- FR-12: "Commit Pill is triggered by the platform's `PostToolUse` hook on `git commit` commands executed inside the Sandbox." Testable and names the mechanism.

Vague language is almost entirely absent. The one partial exception is FR-14's "standard Markdown formatting" — this is underspecified for edge cases (e.g., footnotes, definition lists, raw HTML) but is acceptable at PRD level since a UX spec will govern Markdown renderer selection.

### Findings

- **low** FR-5 says Repository state reflects "the latest committed state … at the time of the most recent page load or manual refresh" but does not specify a staleness bound or error condition if the read fails (§4.1) — the consequence of a failed read is undefined: does the user see stale state, an error, or an empty map? *Fix:* Add a consequence: "If the Repository read fails, the Project Map displays a read-failure notice; it does not silently render stale state."

---

## Scope honesty — strong

Non-Goals (§5) has 11 items that do real work: each names a feature a PM or BA might reasonably expect, states it is out of scope, and — where relevant — the trigger for post-MVP inclusion is in §6.2. The BMAD initialization non-goal is especially load-bearing: without it, the platform's onboarding dependency on the developer champion is obscured.

The Assumptions Index (§13) covers the major inferences. The RESOLVED annotations make the history legible. The §6.2 out-of-scope list names post-MVP triggers for each deferral rather than just listing items — artifact commit failure handling, async completion badge, RBAC, observability dashboards each have a rationale.

The one structural gap: A-11 is missing from the index (the index jumps from A-10 to A-12). This is called out in the Mechanical Notes below.

### Findings

- **low** §6.2 defers "Artifact commit failure error handling and retry logic" with the rationale "BMAD's design minimises conflict risk at MVP scale" but does not name what the user-visible behavior is when a commit fails (§6.2) — a failed commit with no error path is a silent data loss risk. *Fix:* Add a consequence to FR-12 or §6.2: "If the git commit operation inside the Sandbox fails, the BMAD Agent's error output must be visible in the chat stream; the Commit Pill is not emitted."

---

## Downstream usability — adequate

The Glossary (§3) is the best part of this section: 13 terms, each defined once, with a header asserting no synonyms are used. Spot-checking confirms: "Sandbox" is used consistently, "Skill Session" is not abbreviated to "session" (FR-13 refers to "Skill Session" not "session"), and "Artifact" is capitalized throughout. "BMAD Agent" is a glossary term but appears in §4.3 FR-9 as "BMAD Agent" (glossary form) — consistent.

FR and UJ IDs are present and sequential. UJs have a named protagonist (Sarah) and a persona context. FRs cross-reference NFRs inline (FR-9 references NFR-P2; FR-10 references NFR-P1).

However, two downstream usability defects require correction before the architect and UX designer extract from this PRD:

### Findings

- **high** A-7 cross-references FR-18 which does not exist (§13) — A-7 states "no read-only free tier. (§4.5 FR-18)" but the PRD only defines FR-1 through FR-17. FR-17 covers Seat-Gated Access; FR-18 was presumably renumbered or removed. An architect or story author extracting A-7 will hit a dead reference. *Fix:* Correct A-7's cross-reference to FR-17.

- **high** A-11 is absent from the Assumptions Index (§13) — The index lists A-1 through A-12 with a gap at A-11. No inline `[ASSUMPTION: A-11]` appears in the PRD body either. This may be a deleted assumption that was not cleaned up, or an assumption that was never indexed. Either way, it leaves a permanent gap in a numbered sequence that downstream readers will notice. *Fix:* Either define A-11 (if an assumption was intended) or renumber A-12 to A-11 throughout.

- **medium** SM-4 has no defined data collection mechanism (§11) — "referenced in a subsequent developer Skill Session or in team-external documents" has no instrumentation path in MVP. A story author cannot write a story for this measurement because no platform feature captures cross-tool artifact reference. (Noted also under Substance over theater.) *Fix:* As above — add proxy metric or note MVP measurement gap.

- **low** FR-18 is referenced in §6.2's out-of-scope list implicitly ("Role-based access controls beyond Seat / no-Seat") but the in-scope FR covering access (FR-17) covers only Seat/no-Seat — the alignment between §5 and §6.2 on RBAC is consistent, but a UX designer extracting access control requirements should be directed to FR-17 explicitly. *Fix:* Minor — add "(FR-17)" parenthetical to the RBAC out-of-scope line in §6.2.

---

## Shape fit — strong

This is a consumer SaaS product with a multi-persona GTM model (primary user, developer champion, economic buyer) and meaningful UX stakes — non-dev users who have "never heard of a personal access token." The PRD correctly uses UJs with a named protagonist, maps each UJ to the feature section that realizes it, and includes edge cases in each UJ. UJ-1 handles the `_bmad/` absent case; UJ-2 handles session expiry; UJ-3 covers the read-only path.

The PRD's shape — Glossary-anchored, FR-per-feature, testable consequences, explicit non-goals, indexed assumptions — is appropriate for a chain-top document that will feed a UX spec and architecture document. The §0 document purpose statement confirms this intent explicitly.

---

## Mechanical notes

**Glossary drift:** None detected. All 13 glossary terms are used consistently in the forms defined. "Commit Pill" is capitalized consistently. "Repository" is capitalized throughout. "Sandbox" is capitalized consistently.

**ID continuity:**
- FRs: FR-1 through FR-17, contiguous, no gaps or duplicates. ✓
- UJs: UJ-1 through UJ-3, contiguous. ✓
- NFRs: NFR-S1–S6, NFR-P1–P4, NFR-R1–R3, NFR-O1 — contiguous within each group. ✓
- SMs: SM-1 through SM-6, SM-C1, SM-C2 — contiguous. ✓
- Assumptions: A-1 through A-10, then A-12. **A-11 is missing.** Defect. ✗

**Cross-reference integrity:**
- A-7 references "§4.5 FR-18" — FR-18 does not exist. **Defect.** ✗
- FR-9 references NFR-P2 — NFR-P2 exists. ✓
- FR-10 references NFR-P1 — NFR-P1 exists. ✓
- FR-14 references NFR-P4 — NFR-P4 exists. ✓
- FR-9 references UJ-2 via section description "Realizes UJ-2." ✓
- Front matter has duplicate `status` key (lines 3 and 6). Minor YAML defect.

**Assumptions Index roundtrip:**
- Every inline `[ASSUMPTION: A-x]` tag found in the body: A-2 (§8), A-3 (§8), A-4 (§8), A-8 (§4.1), A-9 (§8), A-12 (§4.5 FR-16).
- A-1, A-5, A-6, A-7, A-10 appear only in the index with no inline tag. These are resolutions or context-only entries — acceptable but inconsistent with §0's statement that "all [assumption tags] are indexed in §13."
- A-11 appears in neither the body nor the index. This is a gap that must be resolved.

**UJ protagonist naming:** All three UJs use "Sarah" consistently. ✓

**Required sections:** All sections present (§0 Purpose through §13 Assumptions Index). ✓
