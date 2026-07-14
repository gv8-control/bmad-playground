---
title: "Sprint Change Proposal: Sandbox-Resident Secret Handling (ANTHROPIC_API_KEY + Egress Restriction)"
status: approved
created: 2026-07-03
---

# Sprint Change Proposal: Sandbox-Resident Secret Handling

## 1. Issue Summary

**Trigger:** During the Epic 4 Implementation Readiness Assessment (2026-07-03), no story anywhere was found to own the Anthropic/Claude Agent SDK API key required by PRD §8 Assumption A-3. Follow-up investigation (Architect) found the answer already exists in completed research — but that research never reached `architecture.md` or `epics.md`.

**Discovery context:** `architecture.md`'s `inputDocuments` frontmatter lists research through several 2026-06-12 sandbox/SDK reports, but omits `technical-network-security-between-agent-be-and-daytona-sandbox-research-2026-06-16.md` — dated the same day `architecture.md` itself completed (`completedAt: '2026-06-16'`). A same-day sequencing gap, not an oversight in judgment.

That report establishes two things, both already answered with high confidence:

1. **Where the key lives:** `ANTHROPIC_API_KEY` is injected into each Daytona sandbox as an environment variable at `daytona.create()` time, sourced from `apps/agent-be`'s own Railway environment — the same mechanism already planned for the per-user `GITHUB_TOKEN`.
2. **A real risk neither `architecture.md` nor `epics.md` account for:** per Daytona's own Security Exhibit, *any* secret injected into a sandbox's environment is readable and exfiltratable by the agent process running inside it. This applies equally to `ANTHROPIC_API_KEY` and `GITHUB_TOKEN`. The report recommends a low-effort mitigation: `networkAllowList` egress restriction on every sandbox (GitHub, the Anthropic API, required package registries only; block everything else) — a concrete implementation of NFR-S1/S2's existing network-isolation intent, not a new requirement.

**Evidence:**
- `architecture.md:3-15` (`inputDocuments`) — omits the 06-16 research doc.
- `architecture.md:251-257` (Authentication & Security) — names the Daytona API key and KEK as Railway secrets; never names `ANTHROPIC_API_KEY`.
- `epics.md` Story 3.1's sandbox-init AC — no `networkAllowList` step.
- `epics.md` Story 4.5's Railway secrets AC — omits `ANTHROPIC_API_KEY`.
- `research/technical-network-security-between-agent-be-and-daytona-sandbox-research-2026-06-16.md:184-194` — Daytona Security Exhibit quote + recommended mitigation with example implementation code.

## 2. Impact Analysis

### Epic Impact

- **Epic 1 (done):** No impact.
- **Epic 2 (backlog):** No impact.
- **Epic 3 (backlog):** Story 3.1's sandbox initialization AC gains the `ANTHROPIC_API_KEY`/`GITHUB_TOKEN` injection + `networkAllowList` egress restriction, plus a new testable AC for the negative egress test. No new stories; no resequencing.
- **Epic 4 (backlog):** Story 4.5's Railway secrets AC gains `ANTHROPIC_API_KEY` as a named `apps/agent-be` secret. No new stories.

### Artifact Conflicts

- **`architecture.md`:** 4 targeted edits (frontmatter, Authentication & Security, Sandbox initialization sequence, Infrastructure & Deployment invariants) — see §4.
- **`epics.md`:** Story 3.1 and Story 4.5 AC amendments — see §4.
- **PRD:** No conflict — this reinforces NFR-S1's existing intent, doesn't change it.
- **UX Design:** No conflict.
- **`sprint-status.yaml`:** No change — no epics/stories added, removed, or renumbered.
- **`.env.example`:** Should eventually add an `ANTHROPIC_API_KEY` line — flagged as a follow-up for whoever implements Story 4.5, not executed as part of this planning-artifact change.

### Technical Impact

None yet — Epic 3 and Epic 4 are both still `backlog`; no code exists to migrate. This purely corrects the planning artifacts before implementation starts.

## 3. Recommended Approach

**Selected: Option 1 (Direct Adjustment)** — amend existing story ACs and the architecture decision record. No rollback needed (nothing built yet); no MVP scope change (this is a hardening clarification of already-in-scope sandbox provisioning work, not new scope).

**Effort:** Low. **Risk:** Low. **Timeline impact:** None — both affected stories are still backlog.

## 4. Detailed Change Proposals

### Change 1 — `architecture.md`: add the missing research doc to `inputDocuments`

**Location:** frontmatter, after line 15.

**OLD (last two frontmatter entries):**
> `- '_bmad-output/planning-artifacts/research/technical-docker-per-session-daytona-ai-agent-isolation-research-2026-06-12.md'`

**NEW (append):**
> `- '_bmad-output/planning-artifacts/research/technical-network-security-between-agent-be-and-daytona-sandbox-research-2026-06-16.md'`

### Change 2 — `architecture.md`: new Authentication & Security item

**Location:** after item 5 (Daytona API key), renumbering items 6–7 to 7–8.

**NEW item 6:**
> 6. **Anthropic/Claude Agent SDK API key:** `ANTHROPIC_API_KEY` is injected into each Daytona sandbox as an environment variable at `daytona.create()` time, sourced from `apps/agent-be`'s own Railway environment — the same mechanism already used for the per-user `GITHUB_TOKEN`. Per Daytona's own Security Exhibit, any secret injected into a sandbox's environment is readable and exfiltratable by the agent process running there; this applies equally to `ANTHROPIC_API_KEY` and `GITHUB_TOKEN`. Mitigation: `networkAllowList` egress restriction on every sandbox (GitHub, the Anthropic API, and required package registries only; `networkBlockAll` for everything else) — a low-effort, concrete implementation of NFR-S1/S2's network-isolation intent, added to the sandbox initialization sequence (see Technical Constraints). Host-mediated git operations (agent-be executing git via the Daytona process API instead of handing the sandbox a raw token) is a higher-effort structural alternative, deferred to the post-MVP risk register rather than required for MVP.

### Change 3 — `architecture.md`: Sandbox initialization sequence

**Location:** Technical Constraints & Dependencies bullet (previously line 79).

**OLD:**
> **Sandbox initialization sequence (ordered):** provision → clone (or restore on resume) → inject per-user git config → run `git status --porcelain` → emit `WORKING_TREE_*` event → emit `SESSION_READY`. Git config injection must occur at every provision **and** every resume, not only at initial provision.

**NEW:**
> **Sandbox initialization sequence (ordered):** provision (env vars `ANTHROPIC_API_KEY`/`GITHUB_TOKEN` injected, `networkAllowList` egress restriction applied) → clone (or restore on resume) → inject per-user git config → run `git status --porcelain` → emit `WORKING_TREE_*` event → emit `SESSION_READY`. Git config injection must occur at every provision **and** every resume, not only at initial provision. `networkAllowList` mitigates the credential-exfiltration risk documented for sandbox-resident secrets (see Authentication & Security item 6).

### Change 4 — `architecture.md`: Infrastructure & Deployment invariants

**Location:** "Deployment invariants already locked" bullet (previously line 288).

**OLD:**
> - **Deployment invariants already locked:** `apps/agent-be` must be fronted by an HTTP/2-capable reverse proxy (NFR-R4); NestJS shutdown hooks must drain SSE connections on deploy rather than hard-killing them (single-container constraint).

**NEW:**
> - **Deployment invariants already locked:** `apps/agent-be` must be fronted by an HTTP/2-capable reverse proxy (NFR-R4); NestJS shutdown hooks must drain SSE connections on deploy rather than hard-killing them (single-container constraint); every Daytona sandbox must have `networkAllowList` egress restriction applied at provision time to mitigate exfiltration of sandbox-resident secrets (`ANTHROPIC_API_KEY`, per-user `GITHUB_TOKEN`) — see Authentication & Security item 6.

### Change 5 — `epics.md` Story 3.1: sandbox-init AC + new negative-test AC

**OLD:**
> **And** the sandbox initialization sequence runs in order: provision → clone (or restore on resume) → inject the Story 1.5 git identity into git config → run `git status --porcelain` → emit a working-tree event → emit session-ready

**NEW:**
> **And** the sandbox initialization sequence runs in order: provision (with `ANTHROPIC_API_KEY` and the per-user `GITHUB_TOKEN` injected as sandbox env vars, and a `networkAllowList` egress restriction applied — scoped to GitHub, the Anthropic API, and required package registries only — to mitigate exfiltration of these sandbox-resident secrets) → clone (or restore on resume) → inject the Story 1.5 git identity into git config → run `git status --porcelain` → emit a working-tree event → emit session-ready

**New AC block (added to Story 3.1):**
> **Given** a sandbox with `networkAllowList` applied
> **When** the agent process inside it attempts to reach a host outside the allow-list
> **Then** the connection is rejected — verified by a negative test asserting egress to an arbitrary non-allow-listed host fails

**Rationale:** Closes the exfiltration path Daytona's own Security Exhibit documents; makes the mitigation testable, not just descriptive.

### Change 6 — `epics.md` Story 4.5: name `ANTHROPIC_API_KEY` as a Railway secret

**OLD:**
> **Given** `apps/agent-be` on Railway
> **When** environment variables are set
> **Then** `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK` (generated via `openssl rand -hex 32`), `DAYTONA_API_URL`, `DAYTONA_API_KEY` are present

**NEW:**
> **Given** `apps/agent-be` on Railway
> **When** environment variables are set
> **Then** `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK` (generated via `openssl rand -hex 32`), `DAYTONA_API_URL`, `DAYTONA_API_KEY`, and `ANTHROPIC_API_KEY` (Claude Agent SDK credential, required per PRD §8 Assumption A-3 — injected into each Daytona sandbox at provision time per Epic 3 Story 3.1, not consumed directly by `apps/agent-be` itself) are present

## 5. Implementation Handoff

**Scope classification: Minor** — targeted AC/decision-record amendments to backlog stories, no code exists yet to migrate, no epic/story restructuring.

- **This workflow:** Apply Changes 1–6 to `architecture.md` and `epics.md` upon approval.
- **Developer agent (`bmad-dev-story`), when Story 3.1 and Story 4.5 are picked up:** Implement the `networkAllowList`/env-var injection and the negative egress test per the amended ACs.
- **Follow-up (not part of this proposal):** Add `ANTHROPIC_API_KEY=` to `.env.example` when Story 4.5 is implemented.
- **Success criteria:** `architecture.md` and `epics.md` reflect the amended text; the Epic 4 readiness report's major finding is closed with a sourced answer instead of an open question.
