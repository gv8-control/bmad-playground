---
stepsCompleted: [1, 2, 3]
inputDocuments: []
session_topic: 'Web platform to make BMAD accessible to non-developer roles (PMs, delivery leads, business analysts) without IDE or git knowledge'
session_goals: 'Generate ideas around UX/interface approach, git abstraction layer, persona facilitation, workflow design, and integration patterns that bridge business roles and a developer-centric tool'
selected_approach: 'progressive-flow'
techniques_used: ['What If Scenarios']
ideas_generated: [17]
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Marius
**Date:** 2026-06-11

## Session Overview

**Topic:** Web platform to make BMAD accessible to non-developer roles (PMs, delivery leads, business analysts) without IDE or git knowledge
**Goals:** Generate ideas around UX/interface approach, git abstraction layer, persona facilitation, workflow design, and integration patterns that bridge business roles and a developer-centric tool

### Session Setup

Non-dev stakeholders (PMs, delivery leads, business analysts) are excluded from the BMAD workflow because it requires IDE access and git familiarity. The challenge is to build a web-based platform that gives these roles access to BMAD personas and artifact creation while seamlessly contributing outputs back to the repository — without exposing them to developer tooling.

## Technique Selection

**Approach:** Progressive Technique Flow
**Journey Design:** Systematic development from exploration to action

**Progressive Techniques:**

- **Phase 1 - Exploration:** What If Scenarios — maximum divergent thinking, breaks all constraints
- **Phase 2 - Pattern Recognition:** Mind Mapping — organizes creative chaos into visual clusters
- **Phase 3 - Development:** SCAMPER Method — systematically refines strongest concepts
- **Phase 4 - Action Planning:** Decision Tree Mapping — maps ideas into concrete implementation paths

**Journey Rationale:** This topic sits at the intersection of UX design, developer tooling, and organizational change. Starting with unconstrained "what if" thinking prevents anchoring on obvious solutions (e.g., "just build a GitHub UI wrapper"). Mind mapping then reveals which threads have the most cross-cutting potential. SCAMPER ensures the strongest ideas get full 360° development before Decision Tree grounds them in buildable reality.

---

## Phase 1: What If Scenarios

### MVP Ideas

**[UX #1]: Transparent Simplicity — The Artifact Pill**
_Concept:_ A persistent, ambient notification layer shows BMAD actions as small pills ("Brainstorming committed", "PRD draft saved") — always visible but never in the way. Non-developers stay oriented and aware of the shared, permanent nature of their work without needing to understand git.
_Novelty:_ Sits between Google Docs (hides everything) and GitHub (exposes everything) — legible awareness without operational burden.

**[UX #2]: Expandable Artifact Pills (MVP Scope)**
_Concept:_ Pills show committed artifact events inline. Expanding reveals a human-readable summary of what changed and who's involved. Read-only awareness layer — no further actions.
_Novelty:_ Brings autosave familiarity into a collaborative, multi-agent artifact workflow without exposing git primitives.

**[Core #1]: Living Project Map**
_Concept:_ Home screen is a visual map of the project's BMAD state — skills run, artifacts produced, natural next steps highlighted. Built by reading the output folder structure. Single-module-per-session constraint becomes invisible; feels like project flow.
_Novelty:_ Turns BMAD's stateless skill execution into a stateful project narrative — the map IS the product.

**[MVP #1]: Zero-Friction Onboarding**
_Concept:_ Paste repo URL → OAuth authentication → platform reads `_bmad-output` and renders project map instantly. Developer sets up BMAD in the repo; PM is invited in via the platform.
_Novelty:_ Non-dev never touches git config, SSH keys, or CLI. Repo connection is a URL, not a setup process.

**[MVP #2]: Async Skill Execution with In-App Badge**
_Concept:_ PM starts a skill, can leave the tab. In-app badge notifies when complete. Pill surfaces the committed artifact on return.
_Novelty:_ Treats long-running BMAD skills like background jobs — no babysitting required.

**[MVP #3]: Tab-Based Session Navigation**
_Concept:_ Browser tabs are the natural multi-session model. Project map is one tab; each active skill session is another. PM can juggle multiple sessions on the same project, switching freely.
_Novelty:_ No custom navigation system needed — the browser is the shell. Each tab is a BMAD session instance.

**[MVP #4]: Artifact Browser via Project Map**
_Concept:_ Clicking a completed node on the map opens the artifact as clean rendered markdown. Platform maps BMAD output paths to skill nodes — no file navigation exposed.
_Novelty:_ Artifact reading is a natural extension of the map, not a separate feature.

**[MVP #5]: Fixed Runner, User-Selectable Model**
_Concept:_ Platform is built around one runner (e.g., Claude Code) — not configurable. LLM model is selectable in the UI by the user. All other config lives in the UI.
_Novelty:_ Simplifies platform architecture while giving users meaningful control over cost/capability tradeoffs.

**[MVP #6]: Repo-Mirrored Access Control**
_Concept:_ Platform access = repo access. OAuth authentication determines who can do what. No separate permissions layer. Everyone with repo access can do anything on the platform.
_Novelty:_ Zero admin overhead — access model is already managed by the git provider.

**[Core #2]: Git as Source of Truth**
_Concept:_ Platform reads `_bmad-output` on load and reflects current git state — regardless of how artifacts were produced (platform, CLI, direct commit). No sync, no import, no ownership model.
_Novelty:_ Naturally extends BMAD's own philosophy. Developers and non-devs share the same repo without coordination overhead.

**[Core #3]: Chat Interface for Skill Execution**
_Concept:_ Each skill session tab is a chat interface. PM converses with the BMAD agent naturally. Midway interaction is just the conversation continuing. Skills handle their own context loading from previous artifacts.
_Novelty:_ Execution feels like talking to a domain expert, not running a tool.

**[Core #4]: SaaS Deployment**
_Concept:_ Cloud-hosted platform. Teams connect repos via OAuth. No self-hosting option for MVP.
_Business intent:_ Commercial product. Per-seat pricing.

**[Core #5]: Per-Seat Pricing**
_Concept:_ Monetization is per user. Non-devs and devs alike count as seats.

**[MVP #7]: Persona Identity Header**
_Concept:_ Chat interface shows persistent persona name and role badge — "John — Product Manager." Reinforces structured BMAD workflow vs generic AI chat.
_Novelty:_ Small detail that shapes the PM's mental model — they're working with a specific expert, not a generic AI.

### Constraints Established

- **Main branch only** — no branching for MVP
- **BMAD-native vocabulary** — skill names stay as-is; platform is not a teaching tool
- **No live artifact preview** — skill execution is conversation only; artifact appears via pill on commit
- **No split-screen** — chat is the interface, artifact reveal is the output
- **Developer-only BMAD initialization** — platform assumes `_bmad` already set up
- **Artifact loading is BMAD's responsibility** — skills handle their own context; platform just launches
- **Silent artifact loss on failure** — no retry logic; BMAD's design minimizes conflicts
- **No self-hosting** — SaaS only

### Future Ideas (Post-MVP)

**[Future #1]: Proposal Workflow (Enterprise)**
_Concept:_ Semantic remapping of branch/PR lifecycle to "draft → submit → accepted/revise." Relevant for teams needing parallel workstreams or approval gates.

**[Future #2]: Multi-Role Live Collaboration**
_Concept:_ Shared workspace with real-time agent outputs visible across roles.

**[Future #3]: Automatic Persona Routing**
_Concept:_ Intent detection silently routes user to the right BMAD persona. Core product differentiator post-MVP.

**[Future #4]: Artifact Health Indicators**
_Concept:_ Map shows artifact staleness relative to upstream dependencies — green/yellow/grey states.

**[Future #5]: Artifact Health — Git Consistency**
_Concept:_ Multiple concurrent sessions on main branch need a write-conflict strategy. Implementation concern even if deferred.

### Creative Breakthrough
The sharpest insight from Phase 1: **the project map IS the product.** Not a navigation feature — the central metaphor that makes BMAD's stateless, skill-by-skill execution feel like a coherent, living project. Everything else (pills, artifact browser, chat sessions) orbits this.

---

## Phase 2: Mind Mapping

**Central Node:** Chat Window — where BMAD actually happens. The project map is orientation; the chat is the work.

```
         [Toolbox]
              |
[Project Map] — [CHAT WINDOW] — [Chat Tabs]
```

### Branch 1: Toolbox
Action bar below the chat. Context-aware, session-level navigation.
- Start new session
- Suggested next skill (platform-driven, based on workflow sequence knowledge)
- _Sub-nodes TBD as product develops_

### Branch 2: Project Map
Whole separate navigation feature. PM moves between chat and map; each informs the other.
- Artifact browser (click node → read artifact)
- Skill state visibility
- _Sub-nodes TBD_

### Branch 3: Chat Tabs
Tab bar as session manager. Each open skill session is a tab alongside the project map tab.
- In-app badge for async notifications lives here
- _Sub-nodes TBD_

### Key Cross-Branch Connection
Toolbox's "suggested next skill" is powered by the Project Map's project state — the platform knows workflow sequence because it knows what's already been produced. Intelligence flows from map → toolbox.

---

## Phase 3: SCAMPER

**[SCAMPER-S #1]: Dynamically Suggested Prompts** _(eliminated — see E)_

**[SCAMPER-C #1]: Inline Event Pills in Chat**
_Concept:_ Pills appear inline within the chat stream as intermediate events — "Context loaded from PRD", "Artifact committed", "Skill complete" — between agent messages. Chat is simultaneously conversation and activity log.
_Novelty:_ Eliminates separate notification UI. Single source of truth for dialogue and system events.

**[SCAMPER-A #1]: Skill Progress Indicator**
_Concept:_ Active skill sessions show a progress indicator on the chat tab or chat header reflecting execution stage: loading, active conversation, processing, committing.
_Novelty:_ Gives non-devs a sense of progress in long-running skills without exposing internals.

**[SCAMPER-M #1]: Minimal Chat Box**
_Concept:_ Chat input stripped to essentials — text in, agent response out, inline pills. No formatting toolbar, no attachments, no rich input controls. Intelligence lives in the platform, not the chat chrome.
_Novelty:_ Simplicity is the feature.

**[SCAMPER-P #1]: Semantic Chat Tabs**
_Concept:_ Chat tabs carry live semantic context beyond the skill name — artifact being worked on, current stage, completion state. e.g., "Create PRD — Onboarding Redesign ●". Tab bar becomes a glanceable status layer across all active sessions.
_Novelty:_ Navigation element repurposed as a live dashboard.

**[SCAMPER-E #1]: Eliminate Suggested Prompts**
_Concept:_ Dynamically suggested prompts removed. Hallucination risk and token overhead outweigh friction reduction benefit.

**[SCAMPER-R #1]: No Proactive Nudging**
_Concept:_ Platform-initiated workflow (proactive nudges) rejected. Requires PM tool integrations out of scope, risks feature creep into generic PM tooling.
_Constraint reinforced:_ Platform stays BMAD-native and focused. One job: give non-devs clean access to BMAD.

---

## Phase 4: Decision Tree Mapping

### Root: The Foundational Dependency

**Repo Integration is the only thing that matters first.**
Without it, the platform is just another chat UI — easily substituted by generic AI tools. BMAD's value is operating within the context of a real project. Repo context is the product.

### Build Order

```
        [Repo Integration — OAuth + read/write]
         /              |               \
  [Chat + Skills]  [Project Map]  [Artifact Browser]
```

Three parallel modules — peers, not hierarchy. Each is a browser tab. Each reads/writes through the same repo connection. Can ship in layers: Chat + Skills first, then Project Map, then Artifact Browser.

### Decision Tree #1: Minimum Viable Chat

**Must have (MVP):**
- Chat input + send/cancel buttons
- Chat history with LLM streaming (thinking indicators, token streaming — leverage Claude Code if built on it)
- Tab bar for multi-session navigation
- Inline pill on git commit

**Architecture principle:** Most chat UI components sourced from 3rd party. Don't custom-build what OSS provides.

**Second-class (Phase 2):**
- Semantic tab naming
- Progress indicators
- Persona identity header
- Contextual toolbox
- Suggested next skill

### Decision Tree #2: Minimum Viable Project Map

**Floor:** A list of unfinished artifacts. Not a visual map, not workflow nodes — just: what's incomplete.

**Evolves into:** Full project state visualization in Phase 2, once the concept is validated.

### Decision Tree #3: Minimum Viable Artifact Browser

Dependent on project map. Clicking an unfinished artifact opens it as rendered markdown. Minimal implementation once map list exists.

---

## Session Summary

### Core Product Identity
A web platform that gives non-dev roles (PMs, delivery leads, BAs) clean access to BMAD skills within the context of their real project repo — without IDE access, git knowledge, or AI runner configuration. The platform is BMAD-native, not a generic AI tool.

### MVP Feature Set
1. **Repo Integration** — OAuth + read/write via URL paste
2. **Chat + Skills** — Streaming chat with BMAD agents, tab-based sessions, inline git commit pills
3. **Project Map** — List of unfinished artifacts (evolves into full state map)
4. **Artifact Browser** — Rendered markdown view of existing artifacts
5. **SaaS + Per-seat pricing**

### Key Constraints
- Main branch only (no branching)
- BMAD vocabulary as-is (not a teaching tool)
- Single fixed runner, user-selectable LLM model
- Git as source of truth — no platform-owned state
- No proactive nudging, no PM tool integrations
- BMAD initialization stays with developers

### Phase 2 Priorities
- Automatic persona routing
- Semantic chat tabs + progress indicators
- Artifact health indicators
- Full visual project map
- Proposal/branching workflow (enterprise)
