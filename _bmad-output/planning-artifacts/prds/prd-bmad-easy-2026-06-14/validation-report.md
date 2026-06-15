# Validation Report — bmad-easy

- **PRD:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
- **Rubric:** `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Run at:** 2026-06-15T00:00:00Z
- **Grade:** Poor

## Overall verdict

This PRD is structurally strong: all seven rubric dimensions score strong or adequate, the Vision has a specific thesis, every FR carries testable consequences, NFRs have real numeric targets, and scope decisions are named honestly rather than buried. A reviewer sympathetic to the product would call this a well-made planning document.

The adversarial review shifts the grade to Poor by surfacing three critical strategic gaps the rubric cannot reach. The PAT onboarding step directly contradicts the access-barrier thesis the product is built on, and the success metric (SM-1) will return signal about infrastructure readiness before it returns signal about product-market fit. The competitive window argument claims durable advantages over Claude Code Web that Anthropic could reproduce within the stated window, with no moat analysis to close that gap. The cost model omits Daytona sandbox compute entirely, leaving the $25–$30/seat price point unvalidated against the real cost floor. These are not PRD writing problems — they are unresolved strategic bets the PRD presents as settled, and a skeptical decision-maker at a green-light gate would challenge all three.

## Dimension verdicts

- Decision-readiness — Strong
- Substance over theater — Strong
- Strategic coherence — Strong
- Done-ness clarity — Adequate
- Scope honesty — Strong
- Downstream usability — Strong
- Shape fit — Strong

## Findings by severity

### Critical (3)

**[Adversarial]** — PAT onboarding contradicts the product's access-barrier thesis (§4.1 FR-1, §6.2, §9)
The platform's stated purpose is to give non-dev PMs browser-based access without touching the terminal. The first required action is generating a fine-grained GitHub PAT with contents:write scope. The post-MVP trigger ("if identified as a material activation blocker in beta") is circular: you cannot measure PAT friction as a blocker until after users have already bounced on it. SM-1's 60% target will measure infrastructure readiness before it measures product-market fit.
Fix: Either provide a usability test result showing ≥N% of PM-personas completing PAT setup unassisted, or state that SM-1's 60% target is contingent on PAT setup succeeding, with a separate funnel metric tracking PAT drop-off.

**[Adversarial]** — Competitive window argument is self-contradictory (§9)
§9 lists bmad-easy's "durable advantages" over Claude Code Web — team billing, BMAD-structured sessions, automatic Artifact commitment, Project Map — each either trivially reproducible by Anthropic or dependent on BMAD's continued relevance. The window is stated as 12–24 months total and "4–10 months remaining" in the same section. No evidence is provided that Anthropic's roadmap excludes native team billing or workflow templates.
Fix: Distinguish bmad-easy's structural advantage (BMAD community lock-in, methodology distribution) from feature parity. State explicitly what the durable moat is if Anthropic ships comparable features within the window.

**[Adversarial]** — Cost model omits Daytona compute; unit economics unvalidated (§10)
$3–$6 LLM cost per active seat implies 75–85% gross margin against the $25–$30 price point. Daytona sandbox compute is noted as "add[ing] cost on top" with no estimate. The $0.77/session weighted average assumes prompt caching offsets dependent on session structure and cache TTL. "Validate before launch pricing is locked" has no owner and no date.
Fix: Add an explicit Daytona compute cost estimate (even a range) in §10. State a gross margin floor below which the pricing model must change. Name an owner and a date for the pre-launch cost validation.

### High (4)

**[Adversarial]** — NFR-P2 is a smoke test, not a verified requirement (§7, §12)
"Verified with a single manual test run under normal conditions" does not define normal conditions, repository size, Daytona cold start p90, or provisioning queue contention. A fresh Daytona sandbox provisioning, cloning, and starting Claude Code in under 10 seconds is aggressive even for a 20 MB repository at p90.
Fix: Source a measured Daytona cold start baseline (p50, p90). State the maximum repository size for which NFR-P2 is guaranteed. Commit to surfacing a degraded-mode message when the target is missed.

**[Adversarial]** — Silent agent-initiated commit failure is first-session churn risk (§5, FR-12, FR-14)
§5 explicitly states: "If the Agent's git commit fails during a Conversation, no error is surfaced to the user and no retry is attempted." A user who sees "Progress saved" (Semantic Pill fires on attempt) may have no Artifact in the repository. FR-14's Working Tree State Indicator tracks working tree state, not commit success, and does not update on commit failure.
Fix: Either surface a visible error when an agent-initiated commit fails in MVP, or explicitly state in FR-12 that Semantic Pills for "Progress saved" are emitted only on confirmed commit success.

**[Adversarial]** — Project Map "In Progress" is misleadingly scoped (§4.2 FR-5, FR-6)
"In Progress" status is derived from active platform Conversations only. Locally-running developer sessions are not visible as in-progress — they are invisible entirely, not just undistinguished from platform sessions. The Project Map's claim to show what "the team" is working on is accurate for completed state and silently wrong for in-progress state.
Fix: Clarify in FR-6 that "In Progress" is limited to active platform Conversations. Update §4.2 to reflect that locally-run agent sessions are not visible in any status.

**[Adversarial]** — Commit attribution mechanism is unspecified and may fail silently (§4.1 FR-3)
FR-3 states commits are attributed to the user's platform identity but describes no mechanism. If the Agent runs git commit with a default Sandbox git config, the commit author will be empty or a platform default. GitHub primary email can be private, returning a noreply address. The requirement is real but implementation-free.
Fix: Specify the source for attribution identity (GitHub OAuth primary email, or user-provided override). Note that git config injection is a required Sandbox initialization step. Address the GitHub private email case.

### Medium (4)

**[Rubric / Adversarial]** — SM-4 missing from Success Metrics sequence (§11)
Sequence is SM-1, SM-2, SM-3, SM-5, SM-6 — no SM-4. If intentionally removed, renumber. If accidentally omitted, a validation signal is missing.
Fix: Renumber SM-5 and SM-6 to SM-4 and SM-5, or document what SM-4 was and confirm it was intentionally removed.

**[Rubric]** — Commit attribution identity source unspecified (§4.1 FR-3)
FR-3 states "the user's platform identity (name and email)" without naming the data source for the email field.
Fix: Specify that email is drawn from the GitHub OAuth profile claim, or note if a user-provided override in Settings is permitted.

**[Adversarial]** — EU Data Act claim has no derived requirements (§8)
"Data portability in machine-readable formats and mandatory switching rights must be designed in from launch. These cannot be retrofitted." No requirements in §4 implement this. No data export format, switching mechanism, or implementation scope is defined.
Fix: Derive concrete EU Data Act requirements (what "machine-readable export" means for Artifacts, what switching means) or defer explicitly to post-MVP with a named risk owner.

**[Adversarial]** — Single-container restart impact on active Conversations is unaddressed (§8)
A container restart terminates all active Conversations and Sandboxes without notice. In-progress working tree state is not guaranteed to survive (NFR-R2). Expected restart frequency and user-visible recovery path are not defined.
Fix: State expected restart frequency during MVP. Add a user-visible recovery path for interrupted sessions.

### Low (6)

**[Rubric]** — Missing blast radius on single-container constraint (§8)
The "conscious scope decision" label is correct but the consequence (no burst handling, single point of failure at launch) is not named.
Fix: Add one sentence naming the consequence and the documented mitigation.

**[Rubric]** — NFR-S1 missing from security NFR sequence (§7)
Security NFRs are numbered S2–S5 with no S1.
Fix: Renumber S2–S5 to S1–S4, or add a note explaining why the sequence starts at S2.

**[Rubric]** — Artifact Browser list ordering deferred to UX spec (§4.4 FR-16)
"Artifact ordering is to be determined by the UX spec" creates a hard dependency on a downstream spec for an implementable FR.
Fix: Add a default ordering (e.g., "most recently committed first") as the fallback.

**[Rubric]** — Session lifetime unbounded (§4.5 FR-18)
"Whatever the framework default provides" spans 15 minutes to indefinite. A 15-minute default would eject non-dev users mid-Conversation.
Fix: Add a minimum preference signal (e.g., "session lifetime should be at least 8 hours").

**[Rubric]** — Side navigation specification buried in Constraints (§8)
The persistent side navigation panel specification is in §8 Constraints rather than §4 Features. The UX designer will need to know to look there.
Fix: Move navigation model to §4 or add a cross-reference from §8.

**[Adversarial]** — Three-hop buyer journey has no platform-assisted conversion mechanism in MVP (§2.1)
The developer champion cannot invite teammates during trial (seat management is post-MVP), so the bottleneck motivating the developer is not resolved during evaluation. SM-5 (VP/Director buyer conversion) has no observable mechanism.
Fix: State an early-access model that lets the developer champion add one or two non-dev teammates during trial.

## Mechanical notes

- **Glossary drift:** None detected. Capitalized terms used consistently across all sections.
- **ID continuity:** FR-1–19 contiguous. UJ-1–3 contiguous. NFR-S2–S5 (gap at S1). SM-1–3, SM-5–6 (gap at SM-4). NFR-P1–P5, NFR-R1–R4, NFR-O1 contiguous.
- **Assumptions Index roundtrip:** A-1 through A-7 all indexed in §13 with inline tags. A-4 and A-5 marked resolved. No orphans.
- **UJ protagonist naming:** All three UJs carry "Sarah" as the named protagonist with context inline. Clean.
- **Required sections:** All sections present and substantively populated for a chain-top greenfield SaaS PRD at this stake level.

## Reviewer files

- `review-rubric.md`
- `review-adversarial-general.md`
