---
title: "Product Brief: bmad-easy"
status: final
created: 2026-06-12
updated: 2026-06-14
---

# Product Brief: bmad-easy

## Executive Summary

BMAD (Breakthrough Method for Agile AI-Driven Development) is designed for the whole agile team — Product Managers, Business Analysts, Delivery Leads, and developers alike. In practice, only developers can use it. BMAD runs through IDEs and CLI-based agent harnesses, requiring terminal access, git familiarity, and developer tooling. Non-dev roles either sit it out or participate through enough friction to make the methodology's team-wide promise hollow.

bmad-easy is a SaaS web platform that removes that barrier. Non-dev team members connect their shared repository via OAuth, run BMAD skills through a clean chat interface, and commit artifacts directly back to the repo — the same repo their developers use — with no IDE, no terminal, no git knowledge required. The team stays methodologically aligned because they share a single artifact source of truth. Per-seat subscription; no self-hosting.

A methodology is only as strong as the team participating in it. bmad-easy is a bet on BMAD becoming that methodology for AI-powered agile development — and on being the layer that makes full team participation possible.

---

## The Problem

BMAD is a structured AI workflow methodology with strong and growing practitioner adoption. Its explicit promise is to involve the whole agile team — PMs, architects, developers, QA, delivery leads — through specialised personas and shared artifacts.

In practice, the delivery mechanism betrays the promise. BMAD runs through IDE extensions and CLI-based agent harnesses. This creates a hard barrier for non-dev roles:

- A PM or delivery lead who wants to run a brainstorming session, create a PRD, or contribute to an architecture review must configure a local dev environment, understand git workflows, and operate tooling that was never built for them.
- When teams push BMAD on non-dev members without removing this barrier, participation stays shallow — the tool feels like an imposition, not an invitation.

Current workarounds all fall short. Screensharing sessions with a developer are ad-hoc and don't scale. Generic AI chat tools (ChatGPT, Claude.ai) are not BMAD-aware and produce artifacts disconnected from the repo. Claude Code Web (released October 2025) is the closest substitute — it removes the local installation requirement — but it is still a general-purpose developer tool: it is not BMAD-structured, requires each user to manage their own Claude subscription, and provides no Project Map or automatic artifact commitment to the shared repo. The founder's own team used BMAD, and non-dev members participated — but the experience was rougher than it needed to be, leaving value on the table. The methodology worked; the access layer got in the way.

---

## The Solution

bmad-easy gives non-dev team members a browser-native interface to BMAD that requires no developer tooling. The workflow:

1. A developer sets up BMAD in the shared repository (unchanged from today — no disruption to the dev workflow).
2. The non-dev authenticates via OAuth with their git provider and lands on the **Project Map** — a live view of the project's BMAD state drawn directly from the repository.
3. They open a skill session (brainstorming, PRD creation, domain research, etc.) in a chat tab and converse with the BMAD agent naturally — the same interaction devs have with their agent harness, just without the IDE.
4. On completion, the artifact is committed to the shared repository automatically, the same way a developer would commit it. The project map updates.

The platform otherwise feels like AI harnesses users are already familiar with: a chat history, a list of sessions, streaming responses, and confirmation of actions as they happen. The learning curve is the BMAD methodology itself, not the tool.

The platform reads git state as its source of truth — no platform-owned state, no import/export, no sync overhead. Whatever a developer commits through their IDE and whatever a non-dev commits through bmad-easy live in the same repository, visible to both.

The **Project Map** is the product's central metaphor: a home screen that reflects the project's BMAD state — skills run, artifacts produced, what's in progress. It makes BMAD's stateless, skill-by-skill execution feel like a coherent, living project narrative.

---

## Who This Serves

**Primary users (seat holders)**

Product Managers, Business Analysts, and Delivery Leads on agile software development teams that are using or evaluating BMAD. They are capable professionals who find AI tools compelling but experience developer tooling as a barrier rather than an invitation. Success looks like: completing a BMAD skill session unassisted, contributing an artifact to the shared repo, and feeling like a full participant in the team's AI-driven workflow — not a passenger.

**Decision maker / buyer** [VALIDATED — see market research 2026-06-12]

Head of Product or VP Engineering, depending on which organisational function owns the non-dev seats. At growth-stage companies (20–200 people, the most likely early adopters), this person may hold VP-equivalent authority under a title like "Head of Product" rather than a formal VP title. Budget authority for this purchase sits at department-head level or above; typical approval threshold is $5k/year, above which VP sign-off is required. The GTM implication: qualify by decision-making authority and company size, not job title alone.

**Champion (developer who set up BMAD)**

The developer who initialised BMAD is not just an enabler — they are the primary discovery and sales channel. They experience the non-dev access problem directly (becoming the BMAD bottleneck for their team), discover bmad-easy through the BMAD community, validate it via self-serve trial, and pitch it internally to the economic buyer. GTM must activate developer champions in the BMAD community and equip them with VP-facing materials. Without an active champion, the economic buyer never engages.

**Prerequisite user (technical dependency)**

A developer on the team who initialises BMAD in the repository. The platform assumes `_bmad` is already set up; onboarding non-devs requires a developer to have done this first. This dependency is a known constraint, not a product responsibility.

---

## What Makes This Different

The differentiation is specific and honest:

- **First mover in BMAD-native non-dev access.** Claude Code Web (October 2025) removed the installation barrier but is not BMAD-structured, requires individual subscriptions, and provides no Project Map or automatic artifact commitment. The intersection of browser-native + BMAD-structured + repo-committed artifacts + team-shared project state is unoccupied. Generic AI chat tools and GitHub's web interface do not facilitate BMAD skill execution.
- **Built from lived experience.** The founder uses BMAD and identified this gap within their own team. The product is not a market hypothesis — it is a solution to a friction point already observed in practice.
- **BMAD community as distribution.** BMAD has an established and growing practitioner base. A BMAD-native platform has a natural, ready-made distribution channel that broad AI tools cannot easily access.

The advantage is execution speed and community proximity, not a technical barrier. This is a time-limited advantage that depends on BMAD's continued adoption — acknowledged explicitly in Known Risks.

---

## Vision

If BMAD becomes the dominant framework for AI-powered agile development, bmad-easy is the layer that made full team participation possible — not just developers, but the whole function. Teams that adopt BMAD with non-dev participation produce richer artifacts and develop a shared understanding of the project that spans roles — PMs, BAs, and delivery leads working from the same context as developers, not alongside it.

The longer arc, still grounded in BMAD's methodology: as BMAD's modularity matures, the platform could grow to support custom workflows beyond BMAD's core skill set — adapted to the specific needs of a team or domain, built on the same foundation. That possibility is held loosely. For now, the focus is on doing one thing well: making BMAD accessible to the people it was always meant to serve.

---

## MVP Scope

**In**

- Repository connection via OAuth (GitHub) — URL paste, no CLI setup
- Chat interface with BMAD skill execution: streaming responses, Markdown-rendered agent output, tab-based multi-session, confirmation of key actions
- Project Map — list of in-progress and completed artifacts drawn from `_bmad-output`
- Artifact Browser — view of committed artifacts drawn from `_bmad-output`
- Single agent harness (Claude Code); LLM model hardcoded for MVP
- SaaS deployment, per-seat pricing, no self-hosting

**Explicitly out of MVP**

- Branching or PR workflows (main branch only)
- Proactive nudging or automated workflow suggestions
- Integrations with PM tools (Jira, Confluence, etc.)
- BMAD initialisation or repo configuration (developer responsibility)
- Self-hosted or on-premise deployment
- User-selectable LLM model (planned post-MVP)

---

## Success Criteria

**Methodology validation**

- A non-dev team member completes a BMAD skill session on their own — from initial artifact layout through to a committed result — without a developer guiding them through it
- Non-dev users who complete one session go on to run a second session on their own initiative (shows the tool is an invitation, not a one-time exercise)

**Early signal — first 90 days post-launch**

- At least 3 teams run a full BMAD skill session with a non-dev as the one operating the platform
- Non-dev users in those teams each run at least 3 skill sessions in total, across at least 2 different skill types (shows they are using it as part of their actual workflow, not just trying it once)
- At least one artifact produced through the platform is used as a direct input to subsequent team work — referenced in a developer's session, a sprint planning discussion, or equivalent

**Business signal — 6 months**

- At least one paying customer is a Director or VP-level buyer purchasing seats for non-dev teammates at the full asking price
- Teams that pay for a second month run at least 4 skill sessions that month (shows the tool has become part of their working rhythm, not just something they are keeping around)
- At least one team adds seats or brings in additional non-dev participants beyond the original group

**If this is not working**

- If fewer than 2 teams reach 3 skill sessions within 90 days, the experience needs fundamental rethinking before any further effort to grow the user base

---

## Known Risks

- **BMAD dependency.** The platform's value is directly tied to BMAD's adoption. If a competing methodology overtakes BMAD or if AI development tooling converges on a different paradigm, the platform faces an existential question. This is a deliberate bet, made with eyes open.
- **ICP assumption.** [RESOLVED — 2026-06-12] Market research validated the buyer persona with three refinements: (1) target by budget authority rather than formal title — at growth-stage companies the buyer may be a "Head of Product" not a formal VP; (2) the sale is two-persona — developer champion discovers and pitches, VP/Director approves; (3) the GTM pitch must explicitly address "why not Claude Code Web?" as the primary comparison. See [market research report](_bmad-output/planning-artifacts/research/market-b2b-saas-dev-tooling-buyer-persona-research-2026-06-12.md).
- **Claude Code Web competitive pressure.** Anthropic released a browser-based Claude Code in October 2025. Non-technical PMs are already adopting it. This narrows the "non-dev barrier" differentiation over time. bmad-easy's durable advantages — BMAD-structured sessions, automatic artifact commitment, Project Map, team billing — must be clearly superior to the DIY alternative (Claude Code Web + self-study + manual commits) within 12–18 months of launch.
- **Prerequisite dependency.** The platform requires a developer to have set up BMAD in the repository first. This creates a dependency on developer buy-in that the platform cannot control and that may slow adoption in teams where dev and non-dev onboarding are not coordinated.
