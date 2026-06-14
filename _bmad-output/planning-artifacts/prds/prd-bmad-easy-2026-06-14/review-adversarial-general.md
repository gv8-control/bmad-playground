# Adversarial Review — bmad-easy PRD

## Summary

The core vulnerability is a three-layer dependency trap: the product's entire value proposition rests on BMAD adoption that the platform neither controls nor can accelerate, delivered through a tech stack (Daytona, AG-UI, Claude Agent SDK) where every critical layer requires custom plumbing that doesn't exist yet, and sold to a buyer persona whose existence as a motivated purchaser is asserted rather than evidenced. The "why now" window is real but the product cannot reach it in time if any one of those three dependencies slips. The PRD is polished and thorough on detail while remaining structurally evasive on the hardest questions: how big is the BMAD-using market actually, what does the unit economics look like when LLM cost is a passthrough, and what happens when Anthropic ships the obvious feature.

---

## Findings

### critical — The Addressable Market Is a Population of One Tool's Existing Users (§9, §2.1)

The PRD's "Why Now" section cites 49,000 GitHub stars and 5,680 forks for BMAD. Stars and forks are not seats. The claim that "the community is active, expanding, and producing practitioner guides" is anecdote dressed as market size. There is no estimate of: how many of those star-holders are on active teams using BMAD in production; what fraction of those teams include non-dev members who are actually blocked today; or whether "non-dev team members want to run BMAD sessions themselves" is true or is a PM's theory of what non-devs would want. The entire addressable market is bounded by BMAD's real penetration, not its GitHub star count.

The buyer model compounds this: the "developer champion" must (a) be using BMAD, (b) be frustrated enough by the intermediary burden to spend capital and organizational effort on a solution, and (c) successfully sell upward to a "VP/Director buyer" — three sequential conversions, all assumed. The PRD does not cite a single customer discovery conversation, a waiting list, or any signal that non-dev users have asked for this as a product rather than a better guide.

*Risk:* The entire GTM rests on a market that may be a few hundred active teams globally. If BMAD's real production user base is smaller than the star count suggests (a common trap), the ceiling on seat growth may be reached before the product finds product-market fit.

---

### critical — LLM Cost Passthrough Is Unmodelled and Could Invert Unit Economics (§10, §8, §11)

The PRD sets a target price of $25–$30/seat/month and defers the hybrid usage-based model to "post-MVP consideration." But the platform runs `claude-sonnet-4-6` inside a Daytona sandbox on sessions that "may run 20+ minutes" per the decision log. The PRD includes no estimate of average LLM token cost per session, no estimate of sessions per user per month, and no unit economics calculation showing that the per-seat price covers Daytona sandbox runtime plus LLM cost plus infrastructure plus headcount.

A non-dev PM running a PRD session through a BMAD skill could easily generate 50,000–200,000 tokens in a multi-turn 20-minute conversation. At `claude-sonnet-4-6` rates, a single session could cost $0.75–$3.00 in LLM spend alone. If a PM runs 4 sessions a month (SM-6's retention target implies this), LLM cost per seat per month could reach $3–$12 before any other costs. At 30–40% margin targets, that materially narrows headroom. The PRD's NFR-O1 (spend monitoring) proves the team knows this is a risk but the PRD makes no attempt to bound it.

The "post-MVP" note on usage-based pricing is not a deferral — it's an unresolved structural question being kicked into the product while the per-seat price is locked. If the unit economics don't close at $25–$30/seat flat, the business requires a pricing change at exactly the moment it should be focused on retention and growth.

*Risk:* Launching with per-seat pricing and no cost floor per session means early enthusiastic users can run the business at a loss. Budget alerting (NFR-O1) catches it but does not prevent it.

---

### critical — Every Layer of the Technical Stack Requires Custom Work That Does Not Exist (§8, Assumptions A-4, A-9)

The PRD acknowledges: (1) no official TypeScript adapter between the Claude Agent SDK and the AG-UI protocol exists — the `ClaudeAgentSdkHarness` emitter must be built and maintained internally; (2) Daytona Cloud is an early-stage dependency with AGPL-3.0 as the "continuity fallback," which is not a fallback — it is a large migration; (3) the Stop button implementation requires distinguishing a user-initiated SIGINT from an idle timeout without a supported API path (the decision log cites a GitHub issue, not a resolved capability); and (4) the PostToolUse hook mechanism that triggers Commit Pills is specific to Claude Code and documented nowhere as a stable API.

These four are not independent risks — they are sequential build dependencies. The AG-UI emitter must work before the SSE chat stream works. The SSE stream must work before Commit Pills work. The Stop mechanism must not destroy the Sandbox before multi-turn sessions over 20 minutes are reliable. Any one of these custom components hitting an 8-week delay cascades the entire MVP timeline.

The PRD says "no open questions remain" (§12), but the architectural unknowns in §8 and the Assumptions Index are open engineering questions relabelled as constraints. The distinction matters: a constraint is a known boundary; an unbuilt custom integration against an undocumented hook with no upstream adapter is a risk.

*Risk:* The MVP could ship three months late, or ship with a fundamentally degraded experience (no real-time streaming, no Commit Pills, Stop destroys the session), because the core technical bets have not been validated with a prototype.

---

### high — PAT Onboarding Is Not "Known Activation Friction" — It May Be an Activation Wall (§4.1, §6.2, A-8)

The PRD describes PAT generation as "routine for developers but unfamiliar to PMs and BAs" and calls it "a known activation friction point." This is understatement. Fine-grained GitHub PATs require the user to: navigate GitHub settings, find the Personal Access Tokens (Fine-grained) section, create a token, configure repository scope, set expiry, copy the token before it disappears, and paste it into the product. Non-dev users who are not GitHub users may not have a GitHub account at all — the PRD does not address this.

The PRD's plan is: an "in-product guide must be clear enough that a user who has never heard of a personal access token can complete onboarding without external help." The document then defers the GitHub App integration — which eliminates this step entirely — to post-MVP, triggered by data showing "PAT friction is identified as a material activation blocker in beta." That trigger condition is tautological: you cannot identify the friction as a blocker until you have already lost users to it. The PAT drop-off will likely occur before any session data exists to measure SM-1 (unassisted session completion rate).

*Risk:* The 14-day free trial converts no users not because the product experience is poor but because onboarding never completes. No activation data is collected. The trial period is wasted and there is no fast-follow GitHub App to deploy because it was descoped.

---

### high — "Main Branch Only" Is Not a Minor Caveat — It Is a Team Workflow Blocker (§5, §8)

The PRD lists "branching and pull request workflows" as a non-goal and states all git writes go to the main branch. This is described as "BMAD's design minimises direct write conflicts (Skills write to distinct Artifact paths)." Two problems:

First, many teams protect the main branch with required pull request reviews, branch protection rules, or CI checks. A platform that commits directly to main will be rejected outright by any team with these protections enabled. GitHub's default branch protection is increasingly recommended even for small teams; the PRD does not acknowledge that the target team profile ("40-person SaaS company") very likely has main branch protection enabled.

Second, "last-write-wins" when two concurrent sessions commit to the same Artifact path is described as "a known constraint, not an error condition." At teams using the platform seriously enough to hit SM-3 (at least 3 sessions in 90 days), concurrent writes to the same Artifact are not exotic — a PM and a BA running parallel sessions on the same PRD will silently overwrite each other. The PRD categorizes this as acceptable and defers error handling entirely.

*Risk:* Demo environments work fine on unprotected repos. Real teams — the target buyer — have protected branches. The product fails to function for its ideal customer in the first sales conversation.

---

### high — The "Why Now" Window Argument Is Circular (§9)

The PRD argues that Claude Code Web (launched October 2025) validates the market and defines the competitive window, then argues that bmad-easy's advantages are durable because they are BMAD-specific. But the argument undermines itself: if Anthropic is actively reducing the non-dev access barrier, the moat the PRD claims — "no per-user Claude subscription required, BMAD-structured sessions, automatic Artifact commitment, Project Map, team billing" — can be replicated by Anthropic in a Claude Code Web update at any time.

The PRD estimates 12–24 months before platform encroachment. This is undocumented. There is no analysis of Anthropic's stated roadmap, no competitive teardown of what Claude Code Web already offers non-dev users, and no explanation of why bmad-easy's specific advantages would not be trivially added to Claude Code Web as a BMAD-specific integration. If Anthropic ships native BMAD support in Claude Code Web (which it could, given BMAD is Claude-native), the entire differentiation argument collapses.

The window argument also assumes BMAD itself remains the dominant AI agile methodology at the 12–18 month mark. No competitive analysis of alternative AI-workflow methodologies is included.

*Risk:* The competitive moat is a first-mover lead measured in months against a platform Anthropic controls. Investors will ask: what stops Anthropic from doing this? The PRD has no answer.

---

### high — Success Metrics Do Not Validate the Business Model, Only the Onboarding (§11)

SM-1 (unassisted session completion, ≥ 60%) and SM-2 (repeat rate, ≥ 40%) validate that the onboarding and first session work. They do not validate that the platform is worth $25–$30/seat/month to a team. A user who completes one session and repeats once has cleared a UX bar, not demonstrated willingness to pay.

SM-4 (Artifact utilization, ≥ 30%) is the only metric that attempts to validate downstream value, but it relies on referencing "team-external documents (sprint notes, issue tracker, design brief)" — which are untracked by the platform. How is this measured? The PRD offers no instrumentation plan for SM-4; it cannot be measured from within the product.

SM-5 (one VP/Director buyer at full price within 6 months) is a single-data-point vanity metric that validates the price point for exactly one transaction.

There is no metric for trial-to-paid conversion rate, no metric for net revenue retention, no metric for churn rate, and no metric for whether teams that pay for a second month increase their seat count. These are the metrics that tell you whether you have a business.

*Risk:* At the 6-month mark the team could hit all six success metrics and still be running at 90% churn with no path to growth. The metrics do not close the loop on retention or expansion.

---

### medium — Single-Container NestJS Backend Is a Hidden Reliability Risk, Not a Scope Decision (§8)

The PRD describes the single NestJS container as "a conscious scope decision; horizontal scaling is a post-MVP architectural change." But a single stateful container means: one process crash drops all active Skill Sessions, there is no failover path during deployment, and the 30-minute idle timeout + committed work recovery guarantee (NFR-R2) does not cover in-flight uncommitted agent state.

More specifically: the NFR explicitly acknowledges "uncommitted in-session state is ephemeral and may be lost on Sandbox failure." For a BMAD PRD session that has run 25 minutes and produced a 3,000-word draft but not yet reached the commit step, a NestJS restart or Daytona blip erases that work. The non-dev user who just invested 25 minutes has no recovery path. The PRD accepts this without flagging it to users as a known limitation, and the chat interface provides no indication that work is not persisted until commit.

*Risk:* A single high-profile session loss during beta will be the feedback that defines the product's reputation among the early-adopter developer champions the GTM model depends on.

---

### medium — Artifact Commit Failure Is Deferred with No User-Facing Fallback (§6.2)

The PRD defers "Artifact commit failure error handling and retry logic" to post-MVP, justified by "BMAD's design minimises conflict risk at MVP scale." But the consequence of a failed commit in MVP is: the BMAD Agent produces the Artifact, the commit silently fails, no Commit Pill appears, and the user believes the session produced no output. There is no mention of what the user sees when a commit fails, no fallback to show the Artifact content in-chat, and no mechanism for the user to recover the generated content. Git commit failures — network interruption, PAT expiry mid-session, race condition on the same path — are not exotic; they are table-stakes reliability scenarios.

*Risk:* A non-dev user who loses 20 minutes of work with no explanation and no recovery path does not come back. The 60% unassisted completion target (SM-1) cannot be met if commit failures produce silent data loss.

---

### low — No Repository Size Limit Creates an Unquantified Sandbox Risk (§12, Decision Log Q-4)

The decision log records: "Repository size limit: No limit defined for MVP." A team's monorepo could be 10GB. The Sandbox provisioning time (target: chat ready within 10 seconds per NFR-P2) depends directly on git clone time. A 10GB clone on a shared Daytona node will not complete in 10 seconds, and the platform has no shallow-clone specification, no sparse-checkout requirement, and no size guard. The PRD targets a broad range of "growth-stage companies (1–200 people)" — companies of 150+ people may have large monorepos.

*Risk:* NFR-P2 is violated at first real use on any repository over a few hundred MB, and the team will not discover this until beta because onboarding demos will use clean test repos.
