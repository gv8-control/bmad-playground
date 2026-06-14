---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
research_type: 'market'
research_topic: 'Web-accessible platforms for non-dev roles to run BMAD/Claude Code and contribute to Git repositories'
research_goals: 'Identify platforms that empower non-dev roles (PMs, delivery leads, business analysts) to access and run BMAD or similar Claude Code agent setups via the web, without needing an IDE or git knowledge, while still contributing artifacts back to the repository'
user_name: 'Marius'
date: '2026-06-11'
web_research_enabled: true
source_verification: true
---

# Web Platforms for Non-Developer BMAD Access: Comprehensive Market Research

**Date:** 2026-06-11
**Author:** Marius
**Research Type:** Market Research

---

## Research Overview

This report investigates which web-accessible platforms can host BMAD or comparable Claude Code agent workflows so that non-developer roles — Product Managers, Business Analysts, and Delivery Leads — can participate in AI-driven development without an IDE or Git CLI knowledge, while still committing artifacts directly back to a repository.

The research covers customer behavior and pain points for non-dev roles using AI tools, a competitive analysis of eight candidate platforms ranked by their suitability for this use case, and concrete deployment recommendations. The central finding is that **two complementary paths exist today**: (1) the `@claude` GitHub Action — which requires only a GitHub web browser and a natural-language comment — and (2) Claude Code on the Web at `claude.ai/code` — Anthropic's browser-native BMAD-capable environment. A custom Replit-hosted BMAD web app is the highest-effort but most flexible long-term option.

See Section 5 for strategic recommendations and the deployment decision matrix.

---

## Table of Contents

1. Market Research Introduction and Methodology
2. Market Dynamics — Non-Developer AI Tool Adoption
3. Customer Behavior and Segments
4. Customer Pain Points and Needs
5. Competitive Landscape
6. Strategic Recommendations
7. Risk Assessment and Mitigation
8. Implementation Roadmap
9. Future Outlook
10. Source Documentation

---

## 1. Market Research Introduction and Methodology

### Research Significance

The software development tooling market is undergoing a structural shift: AI agents now handle significant portions of coding, documentation, planning, and testing. Frameworks like BMAD (Breakthrough Method for Agile AI Driven Development, 37,000+ GitHub stars as of June 2026) codify this into structured workflows with specialized personas — PM, Architect, Developer, QA, and more.

However, the *non-developer* personas — Product Managers, Business Analysts, Delivery Leads — are still locked out. BMAD today runs inside IDEs (VS Code, Cursor, JetBrains) through Claude Code CLI. These tools require a terminal, Node.js, and Git familiarity, creating a hard barrier for the exact roles BMAD is designed to empower.

The market question is: **where can BMAD be deployed so that non-dev roles participate via a browser, with artifacts committed to Git, without needing any local tooling?**

### Research Scope Confirmed

- **Platform breadth**: All platforms capable of hosting or running BMAD-style AI agent skills/workflows
- **Hard requirement**: Git integration with ability for non-dev users to commit/push artifacts back to a repository
- **Business goal**: Deployment decision — identify where BMAD can be set up today

### Research Methodology

- Web search queries executed June 2026
- Sources cross-referenced across vendor documentation, independent reviews, and community discussions
- Confidence levels applied to uncertain data points
- Platforms evaluated against a consistent rubric: (a) browser-accessible, (b) Git/GitHub commit capability, (c) ability to run or host BMAD agents/skills, (d) non-developer UX

---

## 2. Market Dynamics — Non-Developer AI Tool Adoption

### Market Size and Growth

Non-developer AI tool adoption is accelerating rapidly in 2025–2026. McKinsey 2025 surveys show companies struggling to translate AI pilots into business results, creating demand for operational roles that go beyond engineering: AI agent architects, AI UX designers, AI governance officers, and product-focused AI operators.

58% of Replit's business builders in 2026 are **non-engineers** — the majority. Product managers make up 7% of Replit's business builder base, but the platform's entire positioning has shifted toward this audience.
_Source: [Replit AI Statistics 2026](https://www.getpanto.ai/blog/replit-ai-statistics)_

### Demand Signal: Claude Code for PMs

A clear signal of demand: multiple independent learning resources for "Claude Code for Product Managers" launched in 2025–2026, including dedicated courses (ccforpms.com), posts on Every.to, Builder.io, Lenny's Newsletter, and Teresa Torres's blog. PMs are explicitly learning to use CLI-based coding agents — but the friction of the terminal remains a persistent complaint.
_Source: [Claude Code for Product Managers — Every.to](https://every.to/source-code/claude-code-for-product-managers)_
_Source: [ccforpms.com](https://ccforpms.com/)_

### Key Market Trend: "Vibe Coding" by Non-Devs

Claude Code went viral over the 2025–2026 winter holidays partly due to non-programmers who used it for "vibe coding" — describing requirements in natural language without understanding the code generated. This represents a latent demand curve for browser-accessible, non-dev-friendly AI agent experiences.
_Source: [Claude Code on the web — Anthropic docs](https://code.claude.com/docs/en/claude-code-on-the-web)_

### Pricing and Business Model Landscape

Most platforms operate on SaaS subscription models with tiered access:

| Platform | Pricing Tier for Target Features |
|----------|----------------------------------|
| Claude Code Web | Pro ($20/mo), Max ($100/mo), Team/Enterprise |
| GitHub Copilot Agent | Copilot Pro+ or Business ($19–$39/user/mo) |
| Replit | Core ($20/mo) or Teams ($35/user/mo) |
| Lovable | Free tier (limited), $25–$50/mo for full GitHub sync |
| GitHub Spark | Copilot Pro Plus subscribers |

---

## 3. Customer Behavior and Segments

### Target Customer Segments

#### Segment 1: Product Manager (PM)

- **Role**: Translates business needs into requirements, roadmaps, and prioritized backlogs
- **AI usage today**: Claude.ai chat for discovery interviews, synthesis, PRD drafting; beginning to experiment with Claude Code CLI
- **BMAD personas relevant**: PM Agent (John), UX Designer (Sally), Tech Writer (Paige)
- **Git familiarity**: Low — typically uses GitHub only to review PRs in the web UI or comment on issues
- **Key behavior**: High text-output tasks (PRDs, epics, user stories). Comfortable in browser-based tools (Notion, Linear, Jira). Would engage with BMAD if it required only a text box and a "Submit" button.
_Source: [Product management on the AI exponential — Anthropic blog](https://claude.com/blog/product-management-on-the-ai-exponential)_

#### Segment 2: Business Analyst (BA)

- **Role**: Bridges business stakeholders and technical teams; gathers requirements, clarifies product goals
- **AI usage today**: Claude.ai and ChatGPT for data analysis, requirement distillation, process documentation
- **BMAD personas relevant**: Analyst Agent (Mary), Tech Writer (Paige)
- **Git familiarity**: Very low — may never have opened a terminal
- **Key behavior**: High read/write tasks. Excellent at structured documents. Would use BMAD if it operated like a form or chat interface, and if artifacts appeared somewhere they could download or share.
_Source: [GitHub Copilot for Business Analysts](https://github.com/orgs/community/discussions/163538)_

#### Segment 3: Delivery Lead / Scrum Master

- **Role**: Owns sprint planning, dependency tracking, retrospectives, team coordination
- **BMAD personas relevant**: Scrum Master persona, Sprint Planning, Retrospective skills
- **Git familiarity**: Medium — may push commits occasionally but avoids branching
- **Key behavior**: High process documentation tasks. Would benefit from BMAD's sprint planning, retrospective, and correct-course skills. Likely most comfortable with a structured web form UI.

### Customer Behavior Patterns

All three segments share a core pattern: **they already use AI chat tools heavily** (Claude.ai, ChatGPT) but stop short of agentic workflows because of the tooling barrier. The gap is not willingness — it is accessibility.

The BMAD "Party Mode" (multiple personas in a single session) is a particularly high-value feature for PMs and BAs, who currently simulate multi-perspective discussions manually. This capability becoming browser-accessible is a strong adoption driver.

---

## 4. Customer Pain Points and Needs

### Pain Point 1 (Critical): Terminal/CLI Barrier

Claude Code today is a terminal-native tool. Non-devs have no mental model for the terminal, cannot install Node.js or run `npx bmad init`, and have no way to interact with BMAD as currently distributed.

**Impact**: Complete blocker for all three target segments.
_Source: [Claude Code for Product Managers — Builder.io](https://www.builder.io/blog/claude-code-for-product-managers)_

### Pain Point 2 (Critical): Git Knowledge Gap

Even on platforms that expose a Git UI (GitHub Codespaces, Gitpod), non-devs do not understand branching, staging, committing, or push/PR workflows. The requirement that BMAD artifacts be committed to a repository must be fulfilled *by the platform or agent*, not by the user.

**Impact**: Even if a non-dev could access BMAD in a browser, they cannot commit outputs without a layer of abstraction handling Git for them.
_Source: [Pain points for non-dev AI tool users — Medium](https://medium.com/@cagdasbalci0/ai-and-automation-tools-for-product-managers-a-comprehensive-guide-e66b20b79647)_

### Pain Point 3 (High): Environment and Deployment Complexity

Replit, GitHub Codespaces, and Gitpod require account setup, repository connections, and environment configuration. These are not insurmountable but add friction that causes non-dev drop-off.

**Impact**: Reduces adoption to motivated early adopters only unless a curated BMAD deployment is pre-configured.

### Pain Point 4 (Medium): Tool Fragmentation

Non-devs already context-switch between Jira, Confluence, Slack, Notion, and GitHub. A BMAD web experience that requires yet another login/tool is a harder sell than one integrated into a tool they already use (e.g., GitHub).

**Impact**: Favors solutions that integrate into existing workflows (GitHub web, Slack) over standalone platforms.

### Pain Point 5 (Medium): Artifact Discoverability

After an AI agent produces a PRD, architecture doc, or set of stories, non-devs need to find, review, and share those artifacts. If they end up as Git commits in a repo the non-dev can't navigate, the value is lost.

**Impact**: The artifact delivery mechanism (PR, preview link, email notification, Jira ticket) matters as much as the generation.

### Unmet Needs Summary

| Need | Currently Met? | Gap |
|------|---------------|-----|
| Run BMAD persona from browser with no install | No | Claude Code Web partially meets this; no other platform natively |
| Artifacts auto-committed to Git | No (except @claude action) | @claude GitHub Action meets this today |
| Non-dev-friendly UI over BMAD chat | No | Requires custom build |
| Artifact review without Git CLI | Partial | GitHub web UI for PRs works |
| Integration with existing PM tools | Partial | MCP integrations (Jira, Linear) exist in Claude Code |

---

## 5. Competitive Landscape

The following platforms were evaluated against four criteria:
- **Browser-accessible**: No local install required
- **Git/GitHub commit**: Artifacts can be committed without CLI knowledge
- **BMAD-capable**: Can run BMAD agents/skills or an equivalent agent framework
- **Non-dev UX**: Interface is accessible to someone with no coding background

### Platform 1: Claude Code on the Web (`claude.ai/code`) ⭐ Tier 1

**What it is**: Anthropic's official browser-native Claude Code, launched October 2025. Runs on Anthropic-managed cloud infrastructure. In research preview for Pro, Max, Team, and Enterprise users.

**Browser-accessible**: ✅ Yes — pure web UI, no local install
**Git commit**: ✅ Yes — clones GitHub repos, pushes branches, opens PRs via secure proxy
**BMAD-capable**: ✅ Yes — BMAD skills and hooks install into Claude Code; they run identically on the web version
**Non-dev UX**: ⚠️ Partial — the interface is conversational and accessible, but BMAD still requires skill installation setup by a developer first; ongoing sessions are non-dev friendly

**Key detail**: Sessions persist even when the browser is closed. Users can monitor sessions from the Claude mobile app. The GitHub OAuth integration handles all authentication — the non-dev never sees a Git command.

**Best for BMAD**: If a developer pre-configures a BMAD-enabled Claude Code session in a project repository, a non-dev PM or BA can open `claude.ai/code`, connect to that project, and run BMAD personas via natural language conversation. Artifacts get committed automatically.

**Limitations**: Still in research preview. Requires Pro/Max/Team subscription. Non-dev would need to understand enough to navigate the session interface. No built-in persona-switcher UI.

_Source: [Use Claude Code on the web — Claude Code Docs](https://code.claude.com/docs/en/claude-code-on-the-web)_
_Source: [Claude Code on the web — Anthropic News](https://www.anthropic.com/news/claude-code-on-the-web)_

---

### Platform 2: `@claude` GitHub Action (claude-code-action) ⭐ Tier 1

**What it is**: Anthropic's official GitHub Action that listens for `@claude` mentions in GitHub issues and pull requests. When triggered, Claude Code executes autonomously — creates a branch, makes changes, runs tests, and opens a PR.

**Browser-accessible**: ✅ Yes — the non-dev interacts entirely through GitHub's web UI (issue comments, PR descriptions)
**Git commit**: ✅ Yes — Claude creates branches and PRs automatically; the non-dev never runs a Git command
**BMAD-capable**: ✅ Yes — the GitHub Action can be configured with a BMAD-enabled Claude Code environment; BMAD skills run inside the action's execution context
**Non-dev UX**: ✅ Excellent — GitHub.com is already familiar to most PMs and BAs who review tickets and PRs; they only need to know how to leave a comment with `@claude`

**Workflow for non-devs with BMAD:**
1. PM opens a GitHub issue: "Create a PRD for the mobile onboarding redesign using the BMAD PM persona"
2. Comments `@claude /bmad-create-prd` with context
3. Claude executes the BMAD skill, generates the PRD, commits it as a file in the repository, and opens a PR
4. PM reviews and approves the PR in GitHub web — no terminal, no Git commands

**Limitations**: Requires a developer to set up and configure the GitHub Action once. Non-devs need a GitHub account. The triggering mechanism (issue comments) is less intuitive than a purpose-built UI. Limited to tasks that can be described in a GitHub issue comment.

_Source: [Claude Code GitHub Actions — Claude Code Docs](https://code.claude.com/docs/en/github-actions)_
_Source: [claude-code-action — GitHub](https://github.com/anthropics/claude-code-action)_
_Source: [Not just for developers — GitHub Blog](https://github.blog/ai-and-ml/github-copilot/not-just-for-developers-how-product-and-security-teams-can-use-github-copilot/)_

---

### Platform 3: Replit (Cloud IDE + Agent) ⭐ Tier 2

**What it is**: Browser-based cloud development environment with an AI agent (Agent 4, March 2026) that can autonomously build, test, and deploy applications. 58% of business builders are non-engineers.

**Browser-accessible**: ✅ Yes — full browser-based IDE, no local install
**Git commit**: ✅ Yes — built-in Git integration; connects to GitHub repos; changes can be committed and pushed from the UI
**BMAD-capable**: ⚠️ Partial — BMAD requires Node.js and can run in Replit's environment; a developer would need to set up a BMAD "wrapper app" (e.g., a simple web UI that calls BMAD skills); Replit Agent itself is not BMAD
**Non-dev UX**: ⚠️ Partial — Replit is designed to be accessible but still exposes code editors and terminal panes; non-devs would need a custom UI layer

**Best use case**: Build a custom BMAD web app hosted on Replit. A developer creates a simple Express.js or Next.js app with a chat interface that routes to BMAD personas via Claude API. Non-devs access it at a public Replit URL. Replit's Git integration handles commits back to the repository.

**Limitations**: Highest setup effort of all options. Replit's Git sync works for the Replit-hosted project but integrating with an *external* Git repo requires explicit configuration. BMAD must be wrapped in a custom web app, not run natively.

_Source: [AI for Product Managers — Replit](https://replit.com/usecases/product-managers)_
_Source: [Replit Review 2026 — Hackceleration](https://hackceleration.com/replit-review)_
_Source: [Replit AI Statistics 2026 — GetPanto](https://www.getpanto.ai/blog/replit-ai-statistics)_

---

### Platform 4: Lovable ⭐ Tier 2 (for artifact delivery, not agent execution)

**What it is**: AI app builder for non-developers ("product builder designed so that non-developers can ship real software"). Two-way GitHub sync is a core feature: every AI change in Lovable creates a commit in GitHub; every commit pushed to GitHub syncs back to Lovable.

**Browser-accessible**: ✅ Yes — pure web UI
**Git commit**: ✅ Yes — automatic two-way sync with GitHub; commits authored as `lovable-dev[bot]` co-attributed to the triggering user
**BMAD-capable**: ⚠️ Low — Lovable is an app builder, not a general agent runner; it cannot natively run BMAD skills/hooks
**Non-dev UX**: ✅ Excellent — designed from the ground up for non-developers

**Best use case**: Use Lovable to *build* the non-dev BMAD web interface described in the Replit option above. A developer sets up the BMAD backend; Lovable is used to rapidly create a polished web UI that non-devs interact with. The resulting app can be connected to the BMAD GitHub repository.

**Limitations**: Not a BMAD runtime environment on its own. Two-way sync is on the default branch (main), which may not fit BMAD's artifact branching strategy. March 2026 incident showed the sync can have reliability issues.

_Source: [Connect to GitHub — Lovable Docs](https://docs.lovable.dev/integrations/github)_
_Source: [Lovable vs Bolt vs Replit 2026 — Lovable](https://lovable.dev/guides/bolt-vs-replit-vs-lovable)_

---

### Platform 5: GitHub Copilot (Agents Panel + Spark) ⭐ Tier 2

**What it is**: GitHub's native AI platform. The Agents Panel (launched late 2025) allows users to delegate tasks from any page on github.com. GitHub Spark (Copilot Pro Plus) allows natural-language app creation with two-way GitHub repo sync.

**Browser-accessible**: ✅ Yes — github.com is the interface
**Git commit**: ✅ Yes — Copilot coding agent creates branches and PRs autonomously
**BMAD-capable**: ⚠️ Low natively — Copilot uses different agent infrastructure; BMAD skills are Claude Code-specific. However, Copilot can be extended with MCP servers and custom instructions that approximate BMAD personas
**Non-dev UX**: ✅ Good — non-devs already on GitHub can use the agents panel without new tooling

**Best use case**: For organizations already on GitHub Copilot Business/Enterprise, the Agents Panel gives non-devs a way to delegate structured tasks (with BMAD-style persona prompts as custom instructions) without Claude Code.

**Key limitation**: This is not native BMAD. Approximating BMAD personas via Copilot custom instructions loses the structured skill workflows, hooks, and session management. For teams committed to BMAD, this is a fallback, not a primary path.

_Source: [Agents panel — GitHub Blog](https://github.blog/news-insights/product-news/agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github/)_
_Source: [GitHub Spark](https://github.com/features/spark)_
_Source: [Not just for developers — GitHub Blog](https://github.blog/ai-and-ml/github-copilot/not-just-for-developers-how-product-and-security-teams-can-use-github-copilot/)_

---

### Platform 6: Claude Cowork ⭐ Tier 3 (Watch)

**What it is**: Anthropic's GUI alternative to Claude Code. Launched research preview January 2026, general availability April 2026 across all paid plans. Grants Claude access to a user-specified folder where it can read, edit, and create files autonomously.

**Browser-accessible**: ⚠️ No — Cowork operates on local folders, not cloud/browser
**Git commit**: ⚠️ Manual — Cowork creates/edits files locally; the user still needs to commit and push via Git
**BMAD-capable**: ✅ Yes — BMAD files in the local folder are accessible to Cowork; skills can be run
**Non-dev UX**: ✅ Excellent GUI — designed to be non-developer friendly

**Assessment**: Cowork solves the UX problem (no terminal needed) but not the Git problem (non-devs still can't commit). This makes it unsuitable as a standalone solution for the stated requirement. Worth watching as Anthropic may add cloud/Git sync in future releases.

_Source: [Claude Features 2026 — Suprmind](https://suprmind.ai/hub/claude/features/)_

---

### Platform 7: Gitpod (Ona) / StackBlitz ⭐ Tier 3 (Developer-facing)

**What it is**: Gitpod is evolving into "Ona" with AI agent focus and GitHub/GitLab/Bitbucket integration. StackBlitz WebContainers run Node.js in the browser and power Bolt.new.

**Browser-accessible**: ✅ Yes (both)
**Git commit**: ✅ Yes (both have Git integration)
**BMAD-capable**: ⚠️ Possible — BMAD can run in a Node.js environment; both platforms support Node.js in the browser
**Non-dev UX**: ❌ No — both are fundamentally developer tools; the interface exposes code editors and terminals

**Assessment**: Technically possible to run BMAD on either platform, but the UX is not appropriate for non-developers without significant custom wrapping. Lower priority than Replit, which at least has explicit non-developer positioning.

_Source: [Gitpod Review 2026 — AI Productivity](https://aiproductivity.ai/tools/gitpod/)_
_Source: [Best Cloud IDE 2026 — Software Scout](https://thesoftwarescout.com/best-cloud-ide-2026-top-browser-based-code-editors-for-developers/)_

---

### Competitive Summary Matrix

| Platform | Browser | Git Commit | BMAD Native | Non-Dev UX | Overall Fit |
|----------|---------|-----------|-------------|------------|-------------|
| Claude Code Web | ✅ | ✅ | ✅ | ⚠️ | **Tier 1** |
| @claude GitHub Action | ✅ | ✅ | ✅ | ✅ | **Tier 1** |
| Replit | ✅ | ✅ | ⚠️ | ⚠️ | **Tier 2** |
| Lovable | ✅ | ✅ | ❌ | ✅ | **Tier 2** (UI layer) |
| GitHub Copilot | ✅ | ✅ | ❌ | ✅ | **Tier 2** (fallback) |
| Claude Cowork | ❌ | ❌ | ✅ | ✅ | **Tier 3** (watch) |
| Gitpod/StackBlitz | ✅ | ✅ | ⚠️ | ❌ | **Tier 3** |

---

## 6. Strategic Recommendations

### Recommendation 1 (Do Today): Deploy the `@claude` GitHub Action with BMAD

**Effort**: Low (1–2 days for a developer to configure)
**Non-dev experience**: Excellent — non-devs need only a GitHub account and browser
**Git requirement**: Fully met — Claude creates branches and PRs autonomously

**Setup steps:**
1. Add `anthropics/claude-code-action` to the repository as a GitHub Actions workflow
2. Configure the action with BMAD's `_bmad/` directory pre-loaded in the execution context
3. Create a GitHub Issue template for each BMAD persona (PM, BA, Architect) with the relevant BMAD skill command pre-filled
4. Non-devs open an issue using the template, fill in their context, and add `@claude` — the agent runs the BMAD skill, commits artifacts, and opens a PR for review

**Why this works now**: The non-dev never leaves GitHub web. The PR review step gives them visibility into what was produced. The artifact (PRD, epic, story) is committed to the repository as a real Git object.

**Artifact discoverability**: Link the PR to the original issue; use GitHub's notification system to alert the non-dev when artifacts are ready.

_Source: [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)_

---

### Recommendation 2 (Do Soon): Onboard Non-Devs to Claude Code on the Web

**Effort**: Low-Medium (developer sets up project once; non-devs onboard with a guide)
**Non-dev experience**: Good — browser-only, conversational interface
**Git requirement**: Fully met — Anthropic's cloud infrastructure handles all Git operations

**Setup steps:**
1. Ensure the repository has BMAD installed (`npx bmad init` completed, `_bmad/` committed)
2. Developer connects the GitHub repository to Claude Code Web and validates the integration
3. Create a short guide (3–5 steps) for non-devs: open `claude.ai/code`, connect to the project repository, start a session, use BMAD persona by typing `/bmad-agent-pm` (or the relevant skill)
4. Non-devs receive Pro/Max/Team subscription seats

**Why this works**: BMAD skills run identically on the web version of Claude Code as they do in the terminal. The conversational interface is more accessible than a terminal but requires the non-dev to know which skill to invoke.

**Gap to address**: Consider creating a BMAD "welcome prompt" that a developer pre-configures as the session starter, so non-devs land in a persona-selection menu rather than a blank prompt.

_Source: [Use Claude Code on the web — Anthropic](https://code.claude.com/docs/en/claude-code-on-the-web)_

---

### Recommendation 3 (Medium-Term): Build a Custom BMAD Web App on Replit

**Effort**: High (2–4 weeks of developer time)
**Non-dev experience**: Excellent (if well-designed)
**Git requirement**: Fully met with explicit configuration

**What to build:**
- A simple Next.js or React web app with a chat interface
- Backend calls BMAD skills via Claude API, with the BMAD persona system replicated in the system prompt
- Git commits handled server-side via the GitHub API (no client-side Git needed)
- Non-devs see a persona selector ("Talk to the PM Agent", "Talk to the Architect", etc.) and a chat window
- Artifacts are committed to the repository with a PR opened for review

**Why invest in this**: The `@claude` GitHub Action and Claude Code Web require non-devs to understand GitHub issues or Claude Code's interface. A purpose-built web app can be designed exactly for these roles — with guided workflows, artifact previews, and one-click approvals. This becomes the definitive non-dev BMAD experience.

_Source: [AI for Product Managers — Replit](https://replit.com/usecases/product-managers)_

---

### Deployment Decision Matrix

| Scenario | Recommended Path |
|----------|-----------------|
| Need something working in < 1 week | `@claude` GitHub Action |
| Non-devs comfortable with GitHub web | `@claude` GitHub Action |
| Non-devs unfamiliar with GitHub | Claude Code Web (with onboarding guide) |
| Want the best long-term non-dev UX | Custom BMAD web app (Replit or Vercel) |
| Organization already on GitHub Copilot Business | GitHub Copilot Agents (BMAD approximation) |
| Budget constraint — free tier only | Replit free tier + custom app |

---

## 7. Risk Assessment and Mitigation

### Risk 1: Claude Code Web Still in Research Preview

Claude Code Web is not yet GA for all users. Features may change or access may be restricted.

**Mitigation**: Pair with the `@claude` GitHub Action as a stable fallback. Both paths committed to in parallel.

### Risk 2: Non-Dev Adoption Friction

Even with browser access, non-devs may find the BMAD skill invocation syntax unfamiliar (e.g., `/bmad-create-prd`).

**Mitigation**: Create team-specific GitHub Issue templates and Claude Code session starters that pre-fill the skill command. Non-dev only fills in context, not syntax.

### Risk 3: GitHub Action Security

The `@claude` GitHub Action executes code in response to issue comments. Without proper scope limiting, a malicious comment could trigger unintended actions.

**Mitigation**: Configure the action to respond only to organization members; restrict which repositories and branches it can push to; use branch protection rules to require PR review before merge.
_Source: [Claude Code sandboxing — Anthropic Engineering](https://www.anthropic.com/engineering/claude-code-sandboxing)_

### Risk 4: Artifact Quality Without Human Review

AI-generated BMAD artifacts (PRDs, stories, architecture docs) committed directly to a repository without review could introduce low-quality or incorrect specifications.

**Mitigation**: Configure all BMAD artifact commits to go to a feature branch with a mandatory PR review by a developer or tech lead before merging to main.

### Risk 5: Lovable Two-Way Sync Reliability

If building the custom BMAD web app UI in Lovable, the March 2026 sync incident shows GitHub synchronization can be unreliable.

**Mitigation**: Use Lovable only for the frontend UI build phase; host the deployed app on Vercel or Netlify with direct GitHub integration rather than relying on Lovable's sync in production.
_Source: [Lovable GitHub sync incident — IsDown](https://isdown.app/status/lovable/incidents/557602-issue-with-github-two-way-synchronization-in-lovable)_

---

## 8. Implementation Roadmap

### Phase 1 — Quick Win (Week 1–2)

- [ ] Developer configures `@claude` GitHub Action on the BMAD repository
- [ ] Create GitHub Issue templates for each BMAD persona (PM, BA, Architect, Delivery Lead)
- [ ] Write a 1-page non-dev guide: "How to trigger BMAD via GitHub"
- [ ] Run a 30-minute walkthrough with 1–2 representative non-dev users
- [ ] Collect feedback on friction points

### Phase 2 — Broaden Access (Week 3–6)

- [ ] Onboard non-devs to `claude.ai/code` web (Pro/Max seats or Team plan)
- [ ] Developer creates a BMAD project connection at `claude.ai/code` and tests skill invocation
- [ ] Write a 3-step non-dev onboarding guide for Claude Code Web
- [ ] Create a "BMAD starter prompt" file in the repository that Claude Code Web auto-loads

### Phase 3 — Purpose-Built UX (Month 2–3, if Phase 1–2 adoption is validated)

- [ ] Define requirements for the custom BMAD web app based on Phase 1–2 feedback
- [ ] Build web app: persona selector + chat + artifact preview + one-click PR approval
- [ ] Deploy on Vercel/Netlify with GitHub OAuth for artifact commit authorization
- [ ] Conduct usability testing with all three non-dev segments (PM, BA, Delivery Lead)

### Success Metrics

| Metric | Target |
|--------|--------|
| Non-dev BMAD sessions per sprint | ≥ 3 per active non-dev user |
| Artifacts committed to repo via non-dev session | 100% (no email/Notion bypass) |
| Time from BMAD skill trigger to PR open | < 5 minutes |
| Non-dev setup time (first use) | < 15 minutes |
| Non-dev satisfaction score | ≥ 4/5 in quarterly survey |

---

## 9. Future Outlook

### Near-Term (6–12 months)

**Claude Code Web will mature**: As it exits research preview, expect improved onboarding, persona management UI, and potentially a "skills marketplace" where BMAD bundles can be installed with one click — dramatically lowering the setup barrier.

**GitHub Copilot Agent capabilities will expand**: Microsoft/GitHub's investment in non-developer AI tooling is substantial. Expect tighter integration between GitHub Issues, Copilot coding agents, and project management workflows.

**Anthropic MCP ecosystem growth**: BMAD's MCP server integrations (Jira, Linear, Slack) will become more mature, enabling richer non-dev workflows where BMAD not only commits to Git but also updates tickets, sends Slack summaries, and syncs documentation.

### Medium-Term (1–2 years)

**AI-native project management tools** will absorb some of what BMAD does today. Products like Notion AI, Linear AI, and Jira AI Agents will run structured multi-persona workflows natively in the browser. The question for BMAD is whether its open-source, customizable model can out-compete these proprietary SaaS tools on flexibility.

**No-code BMAD interfaces**: Given BMAD's 37,000+ GitHub stars and active community, a purpose-built web UI for BMAD (either community-built or from the BMAD team via bmadcode.com) is likely within 12 months. Monitor `bmadcode.com/web-bundles` for developments.

### Strategic Opportunity

The team that deploys a polished web BMAD experience for non-devs first will have a significant internal productivity advantage. The pieces exist today — they require assembly, not invention.

---

## 10. Source Documentation

### Primary Sources

- [Use Claude Code on the web — Claude Code Docs](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Claude Code on the web — Anthropic News](https://www.anthropic.com/news/claude-code-on-the-web)
- [Claude Code GitHub Actions — Claude Code Docs](https://code.claude.com/docs/en/github-actions)
- [claude-code-action — GitHub](https://github.com/anthropics/claude-code-action)
- [BMAD-METHOD — GitHub](https://github.com/bmad-code-org/BMAD-METHOD)
- [AI for Product Managers — Replit](https://replit.com/usecases/product-managers)
- [Connect to GitHub — Lovable Docs](https://docs.lovable.dev/integrations/github)
- [GitHub Spark — GitHub Features](https://github.com/features/spark)
- [Agents panel — GitHub Blog](https://github.blog/news-insights/product-news/agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github/)
- [Not just for developers — GitHub Blog](https://github.blog/ai-and-ml/github-copilot/not-just-for-developers-how-product-and-security-teams-can-use-github-copilot/)

### Secondary Sources

- [Claude Code for Product Managers — Every.to](https://every.to/source-code/claude-code-for-product-managers)
- [ccforpms.com](https://ccforpms.com/)
- [Product management on the AI exponential — Anthropic](https://claude.com/blog/product-management-on-the-ai-exponential)
- [Replit AI Statistics 2026 — GetPanto](https://www.getpanto.ai/blog/replit-ai-statistics)
- [GitHub Copilot for Business Analysts — GitHub Community](https://github.com/orgs/community/discussions/163538)
- [Gitpod Review 2026 — AI Productivity](https://aiproductivity.ai/tools/gitpod/)
- [Claude Code sandboxing — Anthropic Engineering](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Lovable vs Bolt vs Replit 2026 — Lovable](https://lovable.dev/guides/bolt-vs-replit-vs-lovable)
- [Lovable GitHub sync incident — IsDown](https://isdown.app/status/lovable/incidents/557602-issue-with-github-two-way-synchronization-in-lovable)
- [BMAD Framework — Pasquale Pillitteri](https://pasqualepillitteri.it/en/news/171/bmad-framework-claude-code-agile-development)
- [What Is BMAD — Reenbit](https://reenbit.com/the-bmad-method-how-structured-ai-agents-turn-vibe-coding-into-production-ready-software/)
- [Claude Features 2026 — Suprmind](https://suprmind.ai/hub/claude/features/)

### Research Queries Used

1. `non-developer roles using AI coding assistants product managers business analysts 2025 2026`
2. `web-based Claude Code interface browser accessible AI agent 2025 2026`
3. `platforms web IDE git integration non-technical users AI agents 2025 2026`
4. `GitHub Codespaces web browser non-developer AI workflow git commit 2025 2026`
5. `claude.ai code web interface non-developer product manager workflow 2025 2026`
6. `Replit non-technical users product managers AI agent git repository 2025 2026`
7. `Lovable Bolt StackBlitz web app AI agent git commit non-developer 2026`
8. `GitHub Copilot web agent non-developer product manager business analyst use cases 2025 2026`
9. `"Claude Code on the web" anthropic non-developer git repository integration details 2025 2026`
10. `pain points product managers business analysts using AI coding tools without IDE git knowledge`
11. `Gitpod StackBlitz WebContainers browser AI agent non-developer git commit 2026`
12. `BMAD method AI agents web deployment non-developer Claude Code skills browser 2026`
13. `claude.ai/code web interface features limitations non-developer experience 2025 2026`
14. `Lovable GitHub two-way sync non-developer commit pull request artifact workflow 2026`
15. `GitHub Spark no-code web app GitHub repository integration non-developer 2025 2026`
16. `Claude Code GitHub Action "@claude" issue comment PR creation non-developer 2026`

---

**Research Completion Date:** 2026-06-11
**Research Period:** June 2026 — current comprehensive web analysis
**Source Verification:** All key claims cited with current sources
**Confidence Level:** High for Tier 1 platforms (Claude Code Web, @claude Action); Medium for Tier 2 (rapidly evolving market)

_This document serves as a deployment decision guide for making BMAD accessible to non-developer roles via the web, with Git artifact integration as a hard requirement._
