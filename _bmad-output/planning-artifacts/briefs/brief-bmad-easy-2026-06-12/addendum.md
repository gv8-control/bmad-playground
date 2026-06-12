---
title: "Addendum: bmad-easy Product Brief"
status: draft
created: 2026-06-12
updated: 2026-06-12
---

# Addendum: bmad-easy

Supporting depth captured during the brief session. Intended for downstream documents (PRD, architecture, solution design).

---

## Future Roadmap (Post-MVP)

Ideas generated during brainstorming that were deliberately deferred. Not in scope for the brief, but relevant for PRD and architecture planning.

- **Automatic persona routing** — intent detection silently routes the user to the right BMAD persona; identified as a core product differentiator post-MVP
- **Semantic chat tabs** — tab bar carries live semantic context (artifact being worked on, current stage, completion state); repurposes navigation as a glanceable status layer
- **Skill progress indicator** — active sessions show execution stage (loading / active conversation / processing / committing)
- **Artifact health indicators** — project map shows artifact staleness relative to upstream dependencies (green / yellow / grey states)
- **Full visual project map** — Phase 2 evolution of the MVP artifact list into a full state visualisation with workflow nodes
- **Proposal / branching workflow (enterprise)** — semantic remapping of branch/PR lifecycle to "draft → submit → accepted/revise"; relevant for teams needing parallel workstreams or approval gates
- **Multi-role live collaboration** — shared workspace with real-time agent outputs visible across roles
- **Methodology-agnostic workflows** — if BMAD's trajectory warrants it, the platform could become an enabler for custom AI-powered agile workflows beyond the BMAD skill set

---

## ICP Validation — Open Question

The buyer persona (director / VP / C-suite purchasing seats for non-dev teammates) is intuition-based. Key unknowns:

- Does the purchasing decision sit at VP/Director level, or closer to individual team budgets?
- Is the buyer the Head of Product, VP Engineering, or CTO — and does this vary by company size?
- What is the typical team size and BMAD maturity level of early adopters?

Recommended next step: `bmad-market-research` for structured ICP validation before any go-to-market investment.

---

## Technical Architecture Context

The backend architecture research is complete. Key decisions:
- **Backend**: Claude Agent SDK with AG-UI protocol (a standard for structured agent-to-UI communication)
- **Frontend**: Open-source React chat UI with server-sent event (SSE) streaming for real-time responses

Key architectural decisions from brainstorming:
- Single fixed runner (e.g., Claude Code); LLM model is user-selectable in UI
- Git as sole source of truth — platform reads `_bmad-output` on load, no platform-owned state
- Main branch only for MVP — no branching complexity
- Most chat UI components sourced from third-party OSS; no custom-built chat chrome

Reference: `_bmad-output/planning-artifacts/research/technical-backend-service-architecture-claude-agent-sdk-ag-ui-research-2026-06-12.md`

---

## Design Constraints and Rationale

Constraints established during ideation with rationale — relevant for PRD and architecture:

| Constraint | Rationale |
|---|---|
| Main branch only | Simplifies write-conflict handling for MVP; proposal workflow is a post-MVP enterprise feature |
| BMAD vocabulary as-is | Platform is not a teaching tool; practitioner community already knows the terms |
| No live artifact preview during skill execution | Chat is the interface; artifact appears via pill on commit — no split-screen complexity |
| No proactive nudging | Requires PM tool integrations (Jira, etc.) that are out of scope; risks becoming generic PM tooling |
| Developer-only BMAD initialisation | Platform assumes `_bmad` already set up; reduces onboarding scope |
| Silent artifact loss on failure (MVP) | BMAD's design minimises conflicts; retry logic deferred |
| Artifact loading is BMAD's responsibility | Skills handle their own context loading from previous artifacts; platform just launches |

---

## Pricing Model

- Per-seat SaaS subscription; price point not defined
- Non-devs and devs alike count as seats (if devs access the platform)
- No freemium model discussed; no self-hosting

Pricing strategy to be defined in PRD phase.
