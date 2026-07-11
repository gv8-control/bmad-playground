---
title: 'Implementation Readiness Assessment Report'
date: 2026-07-03
project: bmad-easy
scope: 'Epic 4: MVP Cloud Deployment Provisioning (stories 4.1-4.7)'
stepsCompleted: [1, 2, 3, 4, 5, 6]
overallStatus: 'NEEDS WORK'
issues:
  critical: 0
  major: 1
  minor: 2
  accepted: 1
documentsInventoried:
  - type: PRD
    location: prds/prd-bmad-easy-2026-06-14/prd.md
    format: whole
  - type: Architecture
    location: architecture.md
    format: whole
  - type: Epics
    location: epics.md
    format: whole
  - type: UX Design
    location: ux-designs/ux-bmad-easy-2026-06-15/
    format: whole
    includes: [DESIGN.md, EXPERIENCE.md]
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-03
**Project:** bmad-easy
**Scope:** Epic 4 — MVP Cloud Deployment Provisioning (Stories 4.1–4.7) only, per user direction. Epics 1–3 were assessed in the 2026-07-02 report and are not re-assessed here.

## Document Discovery

**PRD**
- Whole: `prds/prd-bmad-easy-2026-06-14/prd.md`

**Architecture**
- Whole: `architecture.md`

**Epics & Stories**
- Whole: `epics.md` (Epic 4 section added 2026-07-03, currently uncommitted)

**UX Design**
- Whole: `ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md`, `EXPERIENCE.md`

No duplicate whole+sharded formats found for any document type.

**Context note:** Epic 4 was added today via an approved Sprint Change Proposal (`sprint-change-proposal-2026-07-03.md`), in response to a request to provision the MVP cloud deployment (Vercel for `apps/web`, Railway+Postgres for `apps/agent-be`). The proposal is reflected as uncommitted diffs in `epics.md`, `architecture.md`, `sprint-status.yaml`, and the Story 1.1 implementation-artifact file.

## PRD Analysis

### Functional Requirements

FR-1: Repository Connection via URL — user connects a GitHub Repository by URL; platform validates write access via OAuth token.
FR-2: BMAD Initialization Validation — platform validates `_bmad/`, `_bmad-output/`, `.claude/` presence and BMAD v6.x.
FR-3: Commit Attribution per User — commits attributed to individual GitHub identity, injected into Sandbox git config.
FR-4: Credential Health Monitoring — 401 flips credential status to `failed`; 403 classified separately; re-auth prompt surfaced.
FR-5: Repository State on Page Load — `_bmad-output/` re-read on page load and manual refresh; no real-time push.
FR-6: Project Map Artifact List — home screen lists Artifacts by type/status; empty state prompts first Conversation.
FR-7: Manual Refresh — re-reads `_bmad-output/`; does not interrupt active Conversations.
FR-8: Navigation from Project Map — completed Artifact → Artifact Browser; in-progress → focus Conversation page.
FR-9: Conversation Initiation — Sandbox provisions on page open; chat ready ≤10s (NFR-P2); blocked over Seat allocation.
FR-10: Streaming Chat Interface — token-by-token streaming, Markdown, Stop button, draft persistence, Enter/Shift+Enter.
FR-11: Concurrent Conversations — independent Sandboxes, max 10/user, semantic titles.
FR-12: Tool Call Visibility and Semantic Recognition — Tool Pills for all calls; `git commit` promoted to "Progress saved" Semantic Pill.
FR-13: Conversation Persistence — always resumable; transparent Sandbox re-initialization.
FR-14: Working Tree State Indicator — amber "Unsaved changes" / muted "All saved" in chat input area.
FR-15: Manual Commit — on-demand Save control; platform-level commit inside Sandbox, bypasses Agent.
FR-16: Artifact Rendering — read-only rendered Markdown, loads ≤2s (NFR-P4).
FR-17: Artifact Access Points — Project Map and Semantic Pills resolve to same rendered view.
FR-18: Platform Authentication — GitHub OAuth only; session ≥8h.
FR-19: Access Control — all access requires authentication; all MVP users full-access, no billing enforcement.

**Total FRs: 19.** None of FR-1–FR-19 describe deployment/infrastructure mechanics directly — they are product-feature requirements. Epic 4 has no direct FR owner; its mandate is inferred entirely from Cross-Cutting NFRs (below) and §8 Constraints, consistent with the Sprint Change Proposal's own finding that "no epic or story currently owns the deployment mechanics."

### Non-Functional Requirements

**Security**
- NFR-S1: Sandbox credential/network isolation — platform-internal credentials never injected into a Sandbox; Sandbox has no route to agent-be internal endpoints.
- NFR-S2: Credential isolation — tenant authorization check before every credential resolution.
- NFR-S3: Active sandbox termination on user deactivation.
- NFR-S4: OAuth token storage — encrypted at rest, never returned to client.

**Performance** (manually verified, not statistically sampled)
- NFR-P1: First streamed token ≤1,500ms.
- NFR-P2: Chat ready ≤10s of Conversation page open (repos <~200MB).
- NFR-P3: Project Map loads ≤2s.
- NFR-P4: Artifact Browser loads ≤2s.
- NFR-P5: Manual commit completes ≤5s (excl. queue time).

**Reliability**
- NFR-R1: Credential health updates within one git operation cycle of a 401.
- NFR-R2: Committed Artifacts always recoverable from Repository independent of Sandbox state.
- NFR-R3: SSE back-pressure — no silent event drops.
- **NFR-R4 (SSE connection capacity):** streaming transport must support 10 concurrent agent SSE connections per browser session without connection starvation — matches FR-11's 10-Conversation limit. **Directly relevant to Epic 4** — architecture.md already flags this requires an HTTP/2-capable path (HTTP/1.1 caps at 6 browser-level connections), which is Story 4.7's entire scope.

**Observability**
- **NFR-O1 (Spend monitoring):** per-user LLM spend tracked via Agent SDK cost reporting from day one; budget alerting operational at launch. **Referenced by Epic 4** (Story 4.7's framing) but explicitly NOT owned by Epic 4 per the Sprint Change Proposal — Epic 3 Story 3.8 owns the implementation; no spend-tracking code exists yet (`apps/agent-be/src/services/` is empty per the proposal's own evidence).

**Total NFRs: 13** (4 Security, 5 Performance, 4 Reliability, 1 Observability).

### Additional Requirements Relevant to Epic 4

From **§8 Constraints & Guardrails**:
- **Stateful platform backend:** "A single container hosts the platform backend for MVP — no horizontal scaling, no shared session registry across containers." This directly shapes Story 4.2/4.3 (single Railway service + Dockerfile, not a multi-instance deployment).
- **Agent SDK credit billing (A-3):** API key auth required, separate credit pool — relevant to Story 4.5's `CREDENTIAL_ENCRYPTION_KEK`/env wiring but the PRD doesn't name an Anthropic API key env var explicitly (see Epic Coverage Validation, next step).
- **SOC 2** and **EU Data Act** guardrails are named but have no MVP-launch-blocking action tied to Epic 4's stories — worth flagging as a completeness gap if Epic 4 is meant to be the last gate before "live."

No FR or NFR in the PRD explicitly mandates Vercel or Railway as platforms — that choice lives entirely in `architecture.md`. This is expected (PRD stays deployment-agnostic) but means Epic 4's stories are validated against architecture.md, not the PRD, for their platform-specific ACs.

### PRD Completeness Assessment

The PRD is a mature, approved document (approved 2026-07-02) with clear FR/NFR numbering and testable consequences. For Epic 4 specifically: the PRD is **silent by design** on deployment mechanics — it describes product behavior, not hosting topology — so there is no PRD gap to report for Epic 4. The two NFRs that touch deployment (NFR-R4, NFR-O1) are both correctly scoped in Epic 4's stories as "confirm platform capability only, not verify end-to-end" — appropriate given Epic 3's SSE/cost-tracking code doesn't exist yet. This is a sound boundary, not a gap.

## Epic Coverage Validation

### Coverage Matrix — Epic 4's Claimed Scope vs. Its 7 Stories

Epic 4 owns no FRs (confirmed: no FR1–FR19 is mapped to Epic 4 anywhere in `epics.md`). Its stated coverage is the **Additional Requirements** bullets "deployment infra" and "CI/CD manual deploy trigger" (`epics.md:232`), sourced from `architecture.md`'s Infrastructure & Deployment section (lines 280–288).

| Requirement (source) | Epic 4 Story | Status |
| --- | --- | --- |
| `apps/web` on Vercel (architecture.md:282) | Story 4.1 | ✓ Covered |
| `apps/agent-be` (Docker) + Postgres on Railway (architecture.md:283) | Story 4.2, 4.3 | ✓ Covered |
| Prisma migrations applied to the Railway instance | Story 4.4 | ✓ Covered |
| Env vars/secrets on both platforms | Story 4.5 | ⚠️ Partially covered — see gap below |
| CI/CD manual deploy trigger (architecture.md:284) | Story 4.6 | ✓ Covered |
| HTTP/2-capable reverse proxy invariant (architecture.md:288, NFR-R4) | Story 4.7 | ✓ Covered |
| NestJS shutdown-hook SSE draining (architecture.md:288) | *Not Epic 4 — Epic 3 Story 3.12* | ✓ Correctly excluded, explicitly noted in Epic 4's own scope line |
| NFR-O1 spend monitoring | *Not Epic 4 — Epic 3 Story 3.8* | ✓ Correctly excluded, explicitly noted |

### Missing Requirements

**Major — Anthropic/Claude Agent SDK API key has no story, anywhere:**

PRD §8 Assumption A-3 states plainly: *"Claude Agent SDK sessions draw from a separate monthly credit pool; **API key authentication is required**."* Architecture confirms the SDK "run[s] inside the Daytona sandbox" (`architecture.md:668`) and lists `@anthropic-ai/claude-agent-sdk` as an `apps/agent-be` dependency (`architecture.md:193`), but:
- Architecture's Infrastructure & Deployment and Auth & Security sections enumerate exactly two Railway secrets for `apps/agent-be`'s external dependencies — the KEK and the Daytona API key (`architecture.md:210-219, 256-257`) — with no equivalent statement for an Anthropic API key.
- Epic 4 Story 4.5's Railway secrets list (`DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`, `DAYTONA_API_URL`, `DAYTONA_API_KEY`) omits it.
- Epic 3 Story 3.1's sandbox initialization sequence (provision → clone → inject git config → `git status` → emit events) never mentions injecting an SDK credential into the sandbox either.
- `.env.example` at the repo root has no `ANTHROPIC_API_KEY` (or equivalent) entry.

This credential has **no owning story in any epic** — it is required by the PRD's own assumption but falls through every downstream document. Since Epic 4's Story 4.5 is explicitly the "wire secrets on both platforms" story, and the Daytona API key (an analogous outbound-auth credential held by `apps/agent-be`) is already in its scope, this is the natural home for it — but it is currently absent.
- **Impact:** Without this, Epic 3's sandbox-agent integration (Stories 3.1–3.4) has no way to actually authenticate Claude Code once it starts making real (non-faked) LLM calls — a blocking gap once Epic 3 moves past its `SandboxServiceFake` test double.
- **Recommendation:** Add an AC to Story 4.5 naming the Anthropic API key (or clarify if it's sourced differently, e.g. per-sandbox via Daytona at Epic 3 provisioning time) and add the corresponding line to `.env.example`.

> **Resolved (2026-07-11):** Sprint Change Proposal `sprint-change-proposal-2026-07-03-sandbox-secrets-hardening.md` (approved) closed this finding. The answer was already in `technical-network-security-between-agent-be-and-daytona-sandbox-research-2026-06-16.md` (same-day sequencing gap — omitted from `architecture.md`'s `inputDocuments`). `ANTHROPIC_API_KEY` is injected into each Daytona sandbox at `daytona.create()` time from `apps/agent-be`'s Railway environment (same mechanism as `GITHUB_TOKEN`). Changes applied: `architecture.md` now documents the key + `networkAllowList` egress mitigation (Auth & Security item 6, sandbox-init sequence, deployment invariant); `epics.md` Story 3.1 AC amended with env-var injection + `networkAllowList` + negative egress test AC; Story 4.5 AC amended to name `ANTHROPIC_API_KEY` as a Railway secret. `.env.example` follow-up deferred to Story 4.5 implementation time.

**Minor — stale cross-reference in the master Requirements Coverage Map:**

`epics.md:212` (the "Additional Requirements" line in the master FR Coverage Map, distinct from the per-epic "Additional Requirements covered" bullets in the Epic List) still reads: *"Epic 1 - ... CI/CD, deployment infra, GitHub org OAuth-restriction dry-run check..."* — unchanged since before Epic 4 existed. This now duplicates/conflicts with Epic 4's own claim at `epics.md:232` ("Additional Requirements covered: deployment infra, CI/CD manual deploy trigger"). The Sprint Change Proposal's Change 1 added the new Epic 4 section but didn't correct this older master-list line, unlike the more careful annotation-not-rewrite treatment given to Story 1.1's AC-4.
- **Impact:** Low — doesn't block implementation, but a future reader scanning the master coverage map alone would conclude Epic 1 (not Epic 4) owns CI/CD and deployment infra.
- **Recommendation:** Amend `epics.md:212`'s Epic 1 entry to drop "CI/CD, deployment infra" (or annotate it the same way Story 1.1's AC-4 was annotated) and confirm it's Epic 4-owned.

### Coverage Statistics (Epic 4 scope only)

- Deployment/CI/CD-relevant requirement items identified: 8 (7 from architecture.md's Infrastructure & Deployment bullets + the Anthropic API key gap surfaced above)
- Items with a clear story owner: 6 of 8 (Story 4.1–4.4, 4.6, 4.7)
- Items partially covered: 0 (Story 4.5's Anthropic API key AC gap was resolved by Sprint Change Proposal 2026-07-03, approved 2026-07-11)
- Items with no owner anywhere: 1 (Anthropic API key — not a Story 4.5 gap alone, but a gap across Epic 3 and Epic 4 both)
- Correctly-excluded items (owned by Epic 3, correctly deferred): 2 (shutdown-hook draining, spend monitoring)

## UX Alignment Assessment

### UX Document Status

Found: `ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` and `EXPERIENCE.md`.

### Alignment Issues

None for Epic 4. Epic 4 is pure infrastructure/deployment provisioning with **no user-facing surface** — it doesn't render a page, ship a component, or touch any of the 20 UX Design Requirements (UX-DR1–UX-DR20), all of which are already correctly mapped to Epics 1–3 (`epics.md:214`). Cross-checked: neither DESIGN.md nor EXPERIENCE.md references deployment status, environment indicators, or any operator-facing UI that Epic 4 would need to build. This is the expected shape for a provisioning epic — no gap to report.

### Warnings

None. UX is not implied for Epic 4's scope, so its absence from Epic 4's stories is correct rather than a coverage gap.

## Epic Quality Review — Epic 4

### A. User Value Focus Check

**🔴 Critical (per standard, with mitigating context) — Epic 4 is a technical/infrastructure epic, not a user-value epic.**

- **Epic Title:** "MVP Cloud Deployment Provisioning" — matches the checklist's own "Infrastructure Setup — not user-facing" red-flag example almost verbatim.
- **Epic Goal:** "so the team has a live, working deployment" — the beneficiary is "the team"/"platform operator," not the PRD's actual persona (Sarah, the PM). All 7 stories are framed "As the platform operator" or "As a developer" — none deliver value to a non-dev seat holder directly.
- **Value Proposition:** Indirect only — Epic 4 makes every other epic's user value *reachable* (nothing is live without it), but delivers nothing a user directly experiences.

**Mitigating context (why this isn't flagged as blocking):** This is not an oversight — the Sprint Change Proposal explicitly considered folding this into Epic 1 ("Option 1: direct adjustment within existing epics") and the user explicitly rejected it in favor of a dedicated epic, reasoning that burying deployment work in a changelog would make it undiscoverable as trackable work. It also mirrors an already-accepted precedent: Epic 1's Story 1.1 ("Scaffold the Platform Monorepo and CI Pipeline") is the identical "As a developer... foundation to build on" pattern, already `done`. Operational/provisioning epics are a recognized, deliberate exception to the user-value rule in this project, not a new violation — but it is worth naming explicitly since the create-epics-and-stories standard has no formal "infrastructure epic" exception carved out anywhere in `epics.md`.

### B. Epic Independence Validation — ✓ Pass

Epic 4 does not require Epic 2 or Epic 3 to complete or to be tested:
- Story 4.7's AC is explicit that it "confirms only the platform-level transport capability" — actually exercising 10 concurrent SSE connections is deferred to Epic 3 Story 3.11, with no forward dependency created.
- The epic's own scope line explicitly excludes NFR-O1 verification (Epic 3 Story 3.8) and SSE-drain verification (Epic 3 Story 3.12) rather than silently assuming they'll exist.
- Epic 4's only dependencies run *backward* to Epic 1 (Story 4.4 applies Epic 1's existing Prisma migrations; Story 4.5 wires `CREDENTIAL_ENCRYPTION_KEK` from Epic 1's envelope-encryption work) — backward dependencies on earlier epics are permitted by the standard; only forward dependencies are forbidden.

### C. Story Sizing & Acceptance Criteria — ✓ Mostly Pass, one 🟡 Minor note

All 7 stories use consistent Given/When/Then structure and are independently sized (one platform/concern per story). One structural characteristic worth flagging:

**🟡 Minor — several ACs require manual, non-code human action, which is atypical for this project's usual dev-agent workflow.** Story 4.1 (create a Vercel project), Story 4.2 (create a Railway project), and Story 4.5's OAuth-App-registration sub-step ("registered manually by the user... this sub-step is manual, not attempted by the agent") all require actual cloud-console/account access that a coding agent cannot perform or verify through `bmad-dev-story`'s normal code-and-test loop. The stories are transparent about this (Story 4.5 explicitly flags its manual sub-step), which is good practice, but Stories 4.1 and 4.2 don't carry the same explicit "manual" flag despite being equally console-driven. This isn't a defect in the requirement itself, but worth calling out before someone runs `bmad-dev-story` against Story 4.1 expecting a normal code-only implementation loop.
- **Recommendation:** Add the same explicit "manual, human-executed" annotation to Stories 4.1 and 4.2 that Story 4.5 already has, so whoever picks up these stories knows upfront they require cloud account credentials/access, not just code changes.

### D. Dependency Analysis — ✓ Pass

Within-epic sequencing is explicit and backward-only: Story 4.2 acknowledges it precedes Story 4.3 ("service shell... pending Story 4.3's Dockerfile"), and Story 4.4/4.5 explicitly consume Story 4.2's `DATABASE_URL` output. This is normal build-order sequencing within a single epic (analogous to Epic 1's Story 1.3 depending on Story 1.2's auth), not a prohibited forward dependency between epics. The Sprint Change Proposal's own recommended order (4.1/4.2 → 4.3 → 4.4/4.5 → 4.6 → 4.7) matches the ACs' internal references exactly — consistent.

### E. Database/Entity Creation Timing — ✓ Pass (N/A)

Story 4.4 applies pre-existing migrations from Epic 1; it creates no new tables, so the "tables created only when first needed" rule doesn't apply here — nothing to flag.

### F. Best Practices Compliance Checklist — Epic 4

- [x] Epic delivers user value — **fails literally, accepted as a deliberate exception (see A)**
- [x] Epic can function independently — pass (see B)
- [x] Stories appropriately sized — pass, with one annotation gap (see C)
- [x] No forward dependencies — pass (see D)
- [x] Database tables created when needed — pass / N/A (see E)
- [x] Clear acceptance criteria — pass, Given/When/Then throughout
- [ ] Traceability to FRs maintained — **partial**: Epic 4 has no FR owner by design (correct, since deployment isn't a PRD FR), but see Epic Coverage Validation above for the Anthropic API key gap and the stale `epics.md:212` cross-reference.

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK** — Epic 4's structure, sequencing, and story-level acceptance criteria are sound and its epic boundary was a deliberate, already-approved decision, not an oversight. One concrete requirements gap and one documentation inconsistency should be closed before stories are picked up, plus one clarity improvement.

### Critical Issues Requiring Immediate Action

1. **Anthropic/Claude Agent SDK API key has no owning story anywhere** (Major). PRD §8 Assumption A-3 requires it; architecture.md confirms the SDK runs inside the Daytona sandbox and lists it as an `apps/agent-be` dependency, but no Railway secret, no `.env.example` entry, and no Epic 3 sandbox-init AC accounts for it. Left unresolved, Epic 3's sandbox-agent integration will have no way to authenticate real Claude Code sessions once it moves past its test fake.

> **Resolved (2026-07-11):** Closed by Sprint Change Proposal `sprint-change-proposal-2026-07-03-sandbox-secrets-hardening.md` (approved). See Missing Requirements §"Major — Anthropic/Claude Agent SDK API key" for the full resolution note. `architecture.md` and `epics.md` (Stories 3.1, 4.5) now reflect the sourced answer.

### Recommended Next Steps

1. Add an AC to Story 4.5 (or a note clarifying it belongs to Epic 3's sandbox provisioning instead) naming the Anthropic API key / Claude Agent SDK credential, its Railway/`.env.example` variable name, and confirm whether it's a Railway secret on `apps/agent-be` or injected per-sandbox at Epic 3 provisioning time.
2. Correct `epics.md:212` — remove "CI/CD, deployment infra" from Epic 1's Additional-Requirements line in the master Requirements Coverage Map (or annotate it the way Story 1.1's AC-4 was annotated) so it doesn't conflict with Epic 4's ownership claim at `epics.md:232`.
3. Add an explicit "manual, human-executed" annotation to Stories 4.1 and 4.2 (matching the one Story 4.5 already has for OAuth App registration), so whoever picks these up knows upfront they require live cloud-console access, not a pure code-and-test loop.
4. No action required on the Epic 4 user-value/technical-epic finding — it's a conscious, already-approved trade-off (see Epic Quality Review §A) — but keep it in mind if this pattern is repeated for future infra work; consider a standing "operational epic" exception note in `epics.md`'s conventions if this becomes a recurring shape.

### Final Note

This assessment identified 4 issues (1 major, 1 minor documentation inconsistency, 1 minor clarity gap, 1 accepted-but-noted structural deviation) scoped entirely to Epic 4. None block starting Stories 4.1–4.4 or 4.6–4.7 immediately; Story 4.5 should incorporate the Anthropic API key clarification before it's considered complete, and the `epics.md:212` correction should land alongside it since both are one-line documentation fixes. Epics 1–3 were not re-assessed here — see the 2026-07-02 report for that coverage.
