---
title: "Adversarial Review — bmad-easy PRD"
created: 2026-06-15
---

# Adversarial Review — bmad-easy PRD

## Summary

The PRD is unusually self-aware — it names its own assumptions, marks its friction points, and avoids most of the vague aspirational language that makes PRDs unreviable. The adversarial lens surfaces a different class of problem: the product's core thesis rests on a target user (non-dev PM) being willing to do something that developers find routine (PAT generation, slash-command invocation, git mental model), the competitive window argument contains a contradiction it never resolves, the cost model is optimistic in ways that could invert the unit economics, and several NFRs are either untestable or will fail on day one under realistic conditions.

---

## Findings

- **critical** PAT onboarding is a conversion-killing activation step the PRD understates (§4.1 FR-1, §6.2, §9)

  The PRD's stated purpose is to give non-dev PMs browser-based access without touching the terminal. The first required action is generating a fine-grained GitHub PAT with `contents:write` scope — a step that requires navigating GitHub's developer settings, understanding permission scopes, and pasting a long token string. This is *not* an "unfamiliar" step for a PM; it is an invisible wall. The PRD acknowledges this ("known activation friction point") and defers the GitHub App fix to post-MVP with a weak trigger ("if identified as a material activation blocker in beta"). That trigger is circular: you cannot measure PAT friction as a "material blocker" until after enough users have bounced on it to produce signal, at which point you have already harmed activation rate. SM-1 (unassisted session completion ≥ 60%) will fail or pass before the post-MVP PAT fix ships, making SM-1 partially measuring infrastructure readiness rather than product-market fit.

  *Challenge:* What is the evidence that a non-developer PM will successfully complete a PAT setup without assistance? Has this been tested with a single representative user?

  *What would satisfy:* Either a concrete usability test result showing ≥ N% of PM-personas completing PAT setup unassisted, or a clear statement that SM-1's 60% target is contingent on PAT setup succeeding, with a separate funnel metric tracking PAT drop-off.

---

- **critical** The competitive window argument contradicts itself (§9)

  §9 argues that Claude Code Web's launch defines a narrowing window and bmad-easy must be in users' hands within 4–10 remaining months. It then lists bmad-easy's "durable advantages" over Claude Code Web as: BMAD-structured sessions, automatic Artifact commitment, Project Map, team billing, no per-user subscription required. Each of these advantages is either trivially reproducible by Anthropic (team billing, model updates, session structuring via system prompts) or dependent on BMAD's own continued relevance (BMAD Skills). The PRD simultaneously claims a "first-mover window" of 12–24 months and that 8 months have already elapsed — so the effective window stated in one sentence is 4–16 months, not a single committed number. No evidence is provided that Anthropic's roadmap does not include native team billing or workflow templates for Claude Code Web. "First-mover advantage" in a category where the platform vendor is the competitor is a claim that requires much stronger support.

  *Challenge:* What specifically prevents Anthropic from shipping team billing and BMAD-style skill templates to Claude Code Web within the stated window? If the answer is "nothing," what is the actual durable moat?

  *What would satisfy:* A competitive analysis that distinguishes bmad-easy's advantage as structural (e.g., BMAD methodology lock-in, community distribution, existing user base) rather than feature parity, with an explicit statement of what the moat is if Anthropic ships comparable features.

---

- **critical** Unit economics are optimistic and the cost floor is incomplete (§10)

  The cost model estimates $3–$6 LLM cost per active seat per month "for typical planning use," against a $25–$30/seat/month price. This looks like a healthy 75–85% gross margin — until the missing costs are added. The PRD notes "Daytona sandbox runtime and infrastructure add cost on top" but provides no estimate. A Daytona Cloud sandbox provisioned per Conversation, running for 20–40 minute skill sessions, will incur compute cost per session. At SM-6's target of ≥ 4 sessions per team per month per active seat, and assuming even a modest sandbox compute rate, the infrastructure line is non-trivial. The PRD says "validate before launch pricing is locked" — but there is no owner, no timeline, and no fallback if the validated cost floor exceeds the price point.

  The cost model also assumes prompt caching offsets are consistently applicable. BMAD skill files are large prompt scaffolds — but caching effectiveness depends on session structure, cache TTL, and whether the Agent SDK surfaces caching reliably. A $0.77/session weighted average built on caching assumptions that fail in practice could double to $1.50+.

  *Challenge:* What is the per-seat gross margin if Daytona sandbox costs are $2–$4/seat/month and caching offsets are 40% lower than modeled?

  *What would satisfy:* An explicit infrastructure cost estimate for Daytona (even a range) in §10, with a stated gross margin floor below which the pricing model must change. Name an owner and a date for the "validate before launch" requirement.

---

- **high** NFR-P2 (10-second chat readiness) is not testable as written and will fail under realistic conditions (§7 Performance, §12 Q-1)

  NFR-P2 states "chat is ready for user input within 10 seconds of opening a Conversation page" and is "verified with a single manual test run under normal conditions." A single manual test run is not verification — it is a smoke test. The NFR does not define: what "normal conditions" means, what repository size was used for the test, what Daytona Cold Start behavior looks like at 90th percentile, or what happens if the Sandbox provisioning queue has contention. §12 Q-1 acknowledges this for large repositories and defers to the architect — but the failure mode is not limited to large repositories. A fresh Daytona sandbox that must provision, clone a repository, and start the Claude Code process in under 10 seconds is aggressive even for a 20 MB repo if Daytona's cold start latency is 5–8 seconds at p90.

  *Challenge:* What is the Daytona Cloud cold start p50 and p90 for sandbox provisioning? Has this been measured, or is 10 seconds a guess?

  *What would satisfy:* A measured Daytona cold start baseline (p50, p90) from the technical research documents, with an explicit maximum repository size for which NFR-P2 is guaranteed, and a commitment to surfacing a degraded-mode message (rather than silent delay) when the target is missed.

---

- **high** Agent-initiated commit failure is a silent data loss mode the PRD normalizes (§5, §6.2)

  The non-goals section explicitly states: "If the Agent's git commit fails during a Conversation, no error is surfaced to the user and no retry is attempted." The PRD frames this as intentional scope management. But the consequence is that a user can complete a 20-minute PRD session, see "Progress saved" in the chat (because the Agent *attempted* a commit), and have no Artifact in the repository if the commit failed — with no notification. FR-15's manual save mitigates this only if the user knows to use it proactively, but the chat UI's Working Tree State Indicator (FR-14) does not update on agent-commit failure either (the indicator logic is based on working tree state, not commit success). A PM who loses 20 minutes of work with no feedback will not return.

  *Challenge:* Has the decision to silently drop agent-commit failures been reviewed in the context of the 60% unassisted completion target (SM-1)? A silent failure during a first session is a near-certain churn event.

  *What would satisfy:* Either surface a visible error when an agent-initiated commit fails (even in MVP), or explicitly state in FR-12 and FR-14 that Semantic Pills indicating "Progress saved" are only emitted on confirmed commit success — and define how confirmation is detected.

---

- **high** The "no real-time updates" constraint creates a misleading Project Map for team use (§4.2 FR-5, FR-7)

  The Project Map's core value proposition is showing "what BMAD work the team has done and what is in progress." But the Project Map only updates on page load and manual refresh. If a developer on the same team commits an Artifact through local Claude Code while a PM is looking at the Project Map, the PM's view is stale with no indication. The "In Progress" status for Conversations is derived from active platform sessions — so a developer's locally-running session will never appear as in-progress. The PRD states that "Artifacts produced by developers through local tooling appear alongside platform-produced Artifacts; the source of production is not distinguished" (FR-6), but in-progress work by developers is invisible entirely, not just undistinguished. The Project Map's claim to show what "the team" has done is misleadingly accurate for completed state and silently wrong for in-progress state.

  *Challenge:* Does the target PM (UJ-1, UJ-3) know that "in progress" on the Project Map means "a platform session is open" rather than "someone is actively working on this"? If not, this is a trust-breaking misrepresentation on the primary navigation surface.

  *What would satisfy:* A clarification in FR-6's consequences that "In Progress" status is limited to active platform Conversations, and that locally-run agent sessions are not visible in any status. The Project Map description in §4.2 should be updated to reflect this scope accurately.

---

- **high** Commit attribution (FR-3) has no mechanism defined and may conflict with the PAT model (§4.1 FR-1, FR-3)

  FR-3 states "commits produced through Conversations are attributed to the individual user's platform identity (name and email)" and that "the PAT is used for HTTPS transport only; it does not appear in the git commit record." This is technically achievable by injecting git `user.name` and `user.email` into the Sandbox's git config — but it requires that the platform know the user's preferred name and email, and that the commit is made *within the Sandbox's git config*, not via the PAT owner's identity. No mechanism is described. If the Agent runs `git commit` inside the sandbox with a default git config, the commit author will be whatever the Sandbox's git config contains (likely empty or a platform default). The requirement is real but implementation-free.

  *Challenge:* Where does the platform get the user's name and email for git attribution? GitHub OAuth provides an email — but GitHub users can have multiple emails and a primary that differs from what they want in git history. Is the OAuth primary email used? What if it is private (GitHub allows email privacy which returns a noreply address)?

  *What would satisfy:* A specified source for the attribution identity (e.g., "GitHub OAuth primary email, or user-provided override in Settings"), and a note in the Sandbox provisioning design that git config injection is a required step in Sandbox initialization.

---

- **medium** SM-4 is missing (§11)

  Success metrics jump from SM-3 to SM-5, with no SM-4. This is either a numbering error from an edit or a deleted metric that was never renumbered. A missing metric in a numbered list undermines confidence in the document's completeness.

  *Challenge:* Was SM-4 intentionally removed? If so, renumber. If not, what was it?

  *What would satisfy:* Either restore SM-4 or renumber SM-5 and SM-6 to SM-4 and SM-5.

---

- **medium** The "no uptime SLA" non-goal is inconsistent with the EU Data Act compliance claim (§5, §8)

  §5 explicitly excludes an uptime SLA ("No uptime target or availability SLA is defined for MVP"). §8 states "EU Data Act (effective September 2025). Data portability in machine-readable formats and mandatory switching rights must be designed into the product architecture from launch. These cannot be retrofitted." The EU Data Act compliance claim is asserted without any requirements derived from it — no data export format, no switching timeline, no implementation scope. "These cannot be retrofitted" is a correct statement, but adding a compliance assertion with zero derived requirements is not meaningful compliance planning; it is risk displacement. Meanwhile, if the product is selling to EU customers, the lack of an uptime SLA may create regulatory exposure under the AI Act's transparency requirements for high-risk AI systems.

  *Challenge:* What specifically does the EU Data Act require of this product, and which requirements in §4 implement it? If none do, this is an unacknowledged gap, not a closed constraint.

  *What would satisfy:* Either derive concrete EU Data Act requirements (at minimum: what "machine-readable export" means for Artifacts, what the "switching" mechanism is) or explicitly defer them to post-MVP with a named risk owner.

---

- **medium** The single-container backend constraint is an availability risk that is understated (§8)

  §8 states "a single container hosts the platform backend for MVP — no horizontal scaling, no shared session registry across containers. This is a conscious scope decision." This is honest. But its consequence is that a container restart (deploy, crash, OOM) terminates all active Conversations and Sandboxes without notice. FR-13 (Conversation Persistence) guarantees that chat history is recoverable, but in-progress working tree state is not (NFR-R2). For a user in the middle of a 30-minute PRD session, a container restart is indistinguishable from a product failure. The PRD does not address how frequently this is expected to happen or what the user-visible experience is when it does.

  *Challenge:* How many times per week is a single-container backend expected to restart (for deploys alone)? Is rolling restart without session termination achievable within the single-container constraint?

  *What would satisfy:* An explicit statement of expected restart frequency during MVP and a user-visible recovery path (e.g., "Session interrupted — your committed work is safe; click to resume"). This is a reliability expectation, not a quality-of-life feature.

---

- **low** The buyer persona relies on a three-hop purchase model that is not validated (§2.1)

  The GTM model is: developer discovers BMAD → developer finds bmad-easy → developer builds internal case → economic buyer approves purchase. This is three sales steps with no platform-assisted support for any of them. The PRD describes the developer champion as someone who "evaluates through a trial run and builds an internal presentation" — but the MVP access model is "all users auto-enrolled with no expiry," meaning there is no trial urgency, no conversion event, and no tool to help the developer build the internal case. The developer's motivation is framed as resolving the "bottleneck of being the team's BMAD operator" — but in MVP, the developer cannot invite teammates to the platform during trial (seat management is post-MVP), so the bottleneck does not get resolved during evaluation.

  *Challenge:* How does the developer champion demonstrate bmad-easy's value to the economic buyer if seat management and trial invitations are post-MVP? What is the conversion mechanism in MVP?

  *What would satisfy:* A stated early-access onboarding model that lets the developer champion add one or two non-dev teammates during the trial period, even if full seat management is deferred. Without this, the purchase path is aspirational.
