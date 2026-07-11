---
title: 'Implementation Readiness Assessment Report'
date: 2026-07-11
project: bmad-easy
scope: 'Epic 4: MVP Cloud Deployment Provisioning (Stories 4.1–4.12)'
stepsCompleted: [1, 2, 3, 4, 5, 6]
overallStatus: 'READY'
issues:
  critical: 0
  major: 0
  minor: 1
  fixed: 3
  accepted: 2
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
  - type: Sprint Change Proposals
    location: sprint-change-proposal-2026-07-03.md
    format: whole
  - type: Sprint Change Proposals
    location: sprint-change-proposal-2026-07-03-sandbox-secrets-hardening.md
    format: whole
  - type: Sprint Change Proposals
    location: sprint-change-proposal-2026-07-11.md
    format: whole
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-11
**Project:** bmad-easy
**Scope:** Epic 4 — MVP Cloud Deployment Provisioning (Stories 4.1–4.12). This is a full re-assessment of Epic 4, superseding the 2026-07-03 report which covered only Stories 4.1–4.7. Epics 1–3 were assessed in the 2026-07-02 report and are not re-assessed here. Epic 6 (Sandbox-Based Agent Execution) is a pending proposal not yet in `epics.md` and is out of scope for this assessment.

## Document Discovery

### PRD Files Found

**Whole Documents:**
- `prds/prd-bmad-easy-2026-06-14/prd.md` (49,239 bytes, 2026-07-06)

### Architecture Files Found

**Whole Documents:**
- `architecture.md` (64,835 bytes, 2026-07-11)

### Epics & Stories Files Found

**Whole Documents:**
- `epics.md` (91,891 bytes, 2026-07-11)

### UX Design Files Found

**Sharded Documents:**
- Folder: `ux-designs/ux-bmad-easy-2026-06-15/`
  - `DESIGN.md` (23,682 bytes)
  - `EXPERIENCE.md` (34,519 bytes)
  - `review-aesthetics.md`, `review-implementation-drift.md`, `review-rubric.md`, `validation-report.md`, `validation-report.html`, `.decision-log.md`

### Supporting Documents Found

- `briefs/brief-bmad-easy-2026-06-12/brief.md` — product brief
- `sprint-change-proposal-2026-07-03.md` — Epic 4 creation proposal (approved)
- `sprint-change-proposal-2026-07-03-sandbox-secrets-hardening.md` — `ANTHROPIC_API_KEY` + egress hardening (approved)
- `sprint-change-proposal-2026-07-11.md` — Epic 6 proposal (pending, not yet in `epics.md`)
- `research/` — 13 technical/market/domain research reports

### Issues Found

No duplicates found. No required documents missing. All four required document types (PRD, Architecture, Epics, UX) are present and current.

## PRD Analysis

### Functional Requirements

FR1: Repository Connection via URL — User connects a GitHub Repository by URL; platform uses the OAuth access token (authorized with `repo` scope at sign-in) to validate write access and complete setup. No token entry field. Token stored encrypted at rest, never returned to client.

FR2: BMAD Initialization Validation — Platform validates the connected Repository contains `_bmad/`, `_bmad-output/`, `.claude/`, and that BMAD is v6.x, before activating the connection. Blocking messages with documentation links on failure.

FR3: Commit Attribution per User — Commits produced through Conversations are attributed to the individual user's GitHub OAuth identity (name/email, injected into Sandbox git config at session init), not a shared platform credential.

FR4: Credential Health Monitoring — Platform monitors stored Repository credentials; any git operation returning 401 updates credential health to `failed` within one operation cycle; 403 responses are classified (rate limit, org restriction, permission denial) without marking the credential as failed; Project Map shows a re-auth notification with a re-authorize flow.

FR5: Repository State on Page Load — Platform reads current `_bmad-output/` state on page load and manual refresh; no real-time push detection in MVP.

FR6: Project Map Artifact List — Authenticated user with a connected Repository sees a list of Artifacts from `_bmad-output/` organized by type and status (completed/in-progress), with empty-state prompt.

FR7: Manual Refresh — User can manually refresh the Project Map to reflect recently committed Artifacts without interrupting active Conversations; refresh indicator shown during the read.

FR8: Navigation from Project Map — Clicking a completed Artifact opens the Artifact Browser; clicking an in-progress Artifact with an open Conversation page brings that page into focus, otherwise opens read-only in the Artifact Browser.

FR9: Conversation Initiation — User opens a new Conversation from the Project Map or side nav; Skills derived from `.claude/skills/` are presented as slash-command suggestions; Sandbox is provisioned and Repository cloned as a background operation on page open; chat ready within 10 seconds (NFR-P2); blocked with upgrade prompt if Seat allocation exceeded.

FR10: Streaming Chat Interface — Agent responses stream token-by-token with Markdown rendering; thinking indicator and distinct tool-execution indicator; first token within 1,500ms (NFR-P1); auto-growing textarea; Enter to send, Shift+Enter for newline; Stop button while processing; per-message and per-code-block copy actions; scroll-to-bottom button; timestamps; persisted unsent draft restored on refresh.

FR11: Concurrent Conversations — User can have up to 10 concurrent active Conversations, each with independent Sandbox/chat history and a stable URL; each Conversation gets a 2–5 word semantic title; "session limit reached" message beyond the cap.

FR12: Tool Call Visibility and Semantic Recognition — Every agent tool call produces an inline Tool Pill at the point of occurrence; `git commit` is promoted to a "Progress saved" Semantic Pill (with artifact type/title and a View link) only after confirmed commit success; failed tool calls produce an error-state Tool Pill with no automatic retry.

FR13: Conversation Persistence — A Conversation is always resumable; navigating to it restores full chat history; underlying Sandbox re-initialization is handled transparently with a loading indicator.

FR14: Working Tree State Indicator — A persistent status indicator in the chat input area shows `● Unsaved changes` (amber) when the working tree is dirty, or `✓ All saved`/hidden when clean; updates after each agent action or manual save.

FR15: Manual Commit — User can commit the current working tree state on demand via a Save control; confirmation labeled "Save" (no git vocabulary); executes a platform-level commit inside the Sandbox bypassing the Agent; does not run mid-agent-turn (fires when next idle); message format `chore(platform-save): checkpoint [<ISO8601 UTC>]`; success shows a Semantic Pill and resets indicator; failure shows an error-state Tool Pill and indicator remains dirty.

FR16: Artifact Rendering — User can view any committed Artifact from `_bmad-output/` as rendered Markdown; single page with two layout states (full-width list vs. list + selected artifact); content read at latest committed revision; read-only; loads within 2 seconds (NFR-P4).

FR17: Artifact Access Points — Artifact Browser is accessible from the Project Map and from Semantic Pills in Conversation chat; both resolve to the same rendered view; "Back" navigation returns to the entry point.

FR18: Platform Authentication — User authenticates via GitHub OAuth, the only sign-up/sign-in path; session persists across refreshes until logout or expiry (minimum 8 hours preferred).

FR19: Access Control — All platform access requires authentication; unauthenticated requests redirect to sign-in; in MVP all authenticated users have unrestricted access to all features (no paywall/trial/billing enforcement); concurrent session limits (FR11) enforced regardless of access status.

**Total FRs: 19.** None of FR1–FR19 describe deployment/infrastructure mechanics directly — they are product-feature requirements. Epic 4 has no direct FR owner; its mandate is inferred entirely from the Additional Requirements (sourced from architecture.md's Infrastructure & Deployment section) and Cross-Cutting NFRs. This is the expected and correct boundary — the PRD stays deployment-agnostic by design.

### Non-Functional Requirements

**Security**

- NFR-S1: Sandbox credential and network isolation — Platform-internal credentials must not be injected into a Sandbox; only the user's OAuth access token is permitted inside for git transport; the Sandbox network must have no accessible routes to the agent backend's internal service endpoints.
- NFR-S2: Credential isolation — Repository OAuth access tokens must never be resolved across users; every git credential lookup must pass a tenant authorization check at the service layer before resolution.
- NFR-S3: Active sandbox termination on deactivation — When a user account is deactivated, all active Sandboxes for that user must be terminated immediately. (Deferred to post-MVP per architecture — no in-app deactivation flow exists in MVP scope.)
- NFR-S4: OAuth token storage — GitHub OAuth access tokens are encrypted (AES-256-GCM) when stored and never returned to the client after initial submission.

**Performance**

- NFR-P1: First streamed token appears within 1,500ms of the user sending a message.
- NFR-P2: Chat is ready for user input within 10 seconds of opening a Conversation page (applies to repositories under ~200MB).
- NFR-P3: Project Map loads within 2 seconds of page open.
- NFR-P4: Artifact Browser loads a committed Artifact within 2 seconds.
- NFR-P5: Manual commit completes within 5 seconds of the save operation executing (exclusive of queue time).

**Reliability**

- NFR-R1: Credential health status must update within one git operation cycle of a 401 response; silent credential failures are not acceptable. A 403 is classified, not treated as a credential failure.
- NFR-R2: Committed Artifacts are always recoverable from the Repository, independent of Sandbox state; uncommitted working tree state is not guaranteed to survive a Sandbox restart.
- NFR-R3: The streaming transport must not silently drop events when the client is slow to consume; it must apply back-pressure and pause token emission until the client is ready.
- **NFR-R4:** The streaming transport must support 10 concurrent agent SSE connections per browser session without connection starvation, matching the FR11 Conversation limit. Transport configuration imposing a lower browser-level connection limit is not acceptable. **Directly relevant to Epic 4** — architecture.md flags this requires an HTTP/2-capable path (HTTP/1.1 caps at 6 browser-level connections), which is Story 4.7's entire scope.

**Observability**

- **NFR-O1:** Platform must track per-user LLM spend via the Agent SDK's cost reporting from day one; budget alerting for anomalous per-user spending must be operational at launch. **Referenced by Epic 4** (Story 4.11's monitoring scope) but explicitly NOT owned by Epic 4 — Epic 3 Story 3.8 owns the spend-tracking implementation; Story 4.11 covers only platform-level uptime/health monitoring, not per-user spend.

**Total NFRs: 13** (4 Security, 5 Performance, 4 Reliability, 1 Observability).

### Additional Requirements

From **architecture.md** Infrastructure & Deployment section (lines 282–290):

1. `apps/web` on Vercel.
2. `apps/agent-be` (Docker) + Postgres on Railway, same platform.
3. CI/CD via GitHub Actions: lint + all available test suites as a gate; deploy is a manual trigger, not automatic on merge.
4. Environments: production only for MVP, no separate staging.
5. Monitoring & logging: platform-native logging (Railway/Vercel) for MVP, plus NFR-O1 per-user LLM spend monitoring with budget alerting wired in from day one.
6. Scaling: single-container ceiling for `apps/agent-be` is accepted for MVP.
7. Deployment invariants: HTTP/2-capable reverse proxy (NFR-R4); NestJS shutdown hooks must drain SSE connections on deploy; every Daytona sandbox must have `networkAllowList` egress restriction at provision time.

From **PRD §8** Constraints & Guardrails:

- Stateful platform backend: single container, no horizontal scaling.
- Agent SDK credit billing (A-3): API key auth required, separate credit pool.
- SOC 2: begin certification ~6 months post-launch; not launch-blocking for Epic 4.
- EU Data Act: data portability must be designed in from launch; not a deployment mechanics concern.

### PRD Completeness Assessment

The PRD is a mature, approved document (approved 2026-07-02) with clear FR/NFR numbering and testable consequences. For Epic 4 specifically: the PRD is **silent by design** on deployment mechanics — it describes product behavior, not hosting topology — so there is no PRD gap to report for Epic 4. The two NFRs that touch deployment (NFR-R4, NFR-O1) are both correctly scoped in Epic 4's stories as "confirm platform capability only, not verify end-to-end" — appropriate given Epic 3's SSE/cost-tracking code doesn't exist yet. This is a sound boundary, not a gap.

## Epic Coverage Validation

### Coverage Matrix — Epic 4's Claimed Scope vs. Its 12 Stories

Epic 4 owns no FRs (confirmed: no FR1–FR19 is mapped to Epic 4 anywhere in `epics.md`). Its stated coverage is the **Additional Requirements** bullets "deployment infra" and "CI/CD manual deploy trigger" (`epics.md:234`), sourced from `architecture.md`'s Infrastructure & Deployment section (lines 282–290).

| # | Requirement (source) | Epic 4 Story | Status |
|---|---|---|---|
| 1 | `apps/web` on Vercel (architecture.md:284) | Story 4.1 | ✓ Covered |
| 2 | `apps/agent-be` (Docker) + Postgres on Railway (architecture.md:285) | Story 4.2, 4.3 | ✓ Covered |
| 3 | Prisma migrations applied to the Railway instance | Story 4.4 | ✓ Covered |
| 4 | Env vars/secrets on both platforms (including `ANTHROPIC_API_KEY`) | Story 4.5 | ✓ Covered (resolved — see note) |
| 5 | CI/CD manual deploy trigger (architecture.md:286) | Story 4.6 | ✓ Covered |
| 6 | HTTP/2-capable reverse proxy invariant (architecture.md:290, NFR-R4) | Story 4.7 | ✓ Covered |
| 7 | Deploy failure recovery and rollback | Story 4.8 | ✓ Covered (new) |
| 8 | Custom domain and stable production URL | Story 4.9 | ✓ Deferred for MVP (see note) |
| 9 | Database backups and restore verification | Story 4.10 | ✓ Covered (new) |
| 10 | Launch-window monitoring and alerting | Story 4.11 | ✓ Covered (new) |
| 11 | Secret rotation reminder mechanism | Story 4.12 | ✓ Covered (new) |
| — | NestJS shutdown-hook SSE draining (architecture.md:290) | *Not Epic 4 — Epic 3 Story 3.12* | ✓ Correctly excluded |
| — | NFR-O1 per-user LLM spend monitoring | *Not Epic 4 — Epic 3 Story 3.8* | ✓ Correctly excluded (Story 4.11 covers only platform-level uptime, explicitly defers NFR-O1) |

### Notes on Coverage

**Story 4.5 — `ANTHROPIC_API_KEY` (previously a Major finding, now resolved):**

The 2026-07-03 report flagged this as a Major gap — `ANTHROPIC_API_KEY` had no owning story anywhere. Sprint Change Proposal `sprint-change-proposal-2026-07-03-sandbox-secrets-hardening.md` (approved) closed this finding. `ANTHROPIC_API_KEY` is now named in Story 4.5's Railway secrets AC, and Story 3.1's sandbox-init AC was amended to document injection at `daytona.create()` time with `networkAllowList` egress mitigation. Architecture was updated to document the key and the egress restriction. **This gap is fully closed.**

**Story 4.5 — `AGENT_BACKEND_JWT_SECRET` (stale, noted in story annotations):**

The 2026-07-11 annotation on Story 4.5 correctly identifies that `AGENT_BACKEND_JWT_SECRET` is stale — the boundary JWT implementation uses `AUTH_SECRET` for both signing and validation, not a separate key. The annotation instructs removing `AGENT_BACKEND_JWT_SECRET` from both env var lists. This is a documentation accuracy issue in the AC text, not a missing requirement — the implementation already uses `AUTH_SECRET`. **The AC text should be corrected before implementation begins.** See Minor Finding #1 below.

**Story 4.9 — Deferred for MVP:**

Story 4.9 (Custom Domain) carries a 2026-07-11 note: "Deferred for MVP. The `*.vercel.app` production URL from Story 4.1 is stable (does not change between deploys) and sufficient for OAuth callback, Auth.js sessions, and SSE." This is a sound decision — neither the architecture nor PRD requires a custom domain. The deferral is transparently documented. **No gap.**

### Missing Requirements

None. All deployment-relevant requirements from architecture.md's Infrastructure & Deployment section and the PRD's §8 constraints are either covered by a story or correctly deferred to Epic 3 / post-MVP.

### Coverage Statistics

- Deployment/CI/CD-relevant requirement items identified: 11 (7 from architecture.md's Infrastructure & Deployment bullets + 4 new operational stories added since the 2026-07-03 report: rollback, backups, monitoring, secret rotation)
- Items with a clear story owner: 11 of 11
- Items with no owner anywhere: 0
- Items correctly excluded (owned by Epic 3): 2 (shutdown-hook draining, per-user spend monitoring)
- Items deferred for MVP: 1 (custom domain — Story 4.9)

## UX Alignment Assessment

### UX Document Status

Found: `ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` and `EXPERIENCE.md`.

### Alignment Issues

None for Epic 4. Epic 4 is pure infrastructure/deployment provisioning with **no user-facing surface** — it doesn't render a page, ship a component, or touch any of the 20 UX Design Requirements (UX-DR1–UX-DR20), all of which are already correctly mapped to Epics 1–3 (`epics.md:216`). Cross-checked: neither DESIGN.md nor EXPERIENCE.md references deployment status, environment indicators, or any operator-facing UI that Epic 4 would need to build.

### Warnings

None. UX is not implied for Epic 4's scope, so its absence from Epic 4's stories is correct rather than a coverage gap. Story 4.11 (monitoring) configures external uptime checks (UptimeRobot) — no in-app UI is needed for this.

## Epic Quality Review — Epic 4 (Stories 4.1–4.12)

### A. User Value Focus Check

**Accepted exception — Epic 4 is a technical/infrastructure epic, not a user-value epic.**

- **Epic Title:** "MVP Cloud Deployment Provisioning" — matches the checklist's own "Infrastructure Setup — not user-facing" red-flag example.
- **Epic Goal:** "so the team has a live, working deployment" — the beneficiary is "the platform operator," not the PRD's actual persona (Sarah, the PM). All 12 stories are framed "As the platform operator" or "As a developer" — none deliver value to a non-dev seat holder directly.
- **Value Proposition:** Indirect only — Epic 4 makes every other epic's user value *reachable* (nothing is live without it), but delivers nothing a user directly experiences.

**Mitigating context (why this is accepted, not blocking):** This is not an oversight — the Sprint Change Proposal explicitly considered folding this into Epic 1 and the user explicitly rejected it in favor of a dedicated epic, reasoning that burying deployment work in a changelog would make it undiscoverable as trackable work. It mirrors an already-accepted precedent: Epic 1's Story 1.1 ("Scaffold the Platform Monorepo and CI Pipeline") is the identical "As a developer... foundation to build on" pattern, already `done`. Operational/provisioning epics are a recognized, deliberate exception to the user-value rule in this project.

**Recommendation:** Consider adding a standing "operational epic" exception note in `epics.md`'s conventions section if this pattern is repeated for future infra work (e.g., Epic 6).

### B. Epic Independence Validation — ✓ Pass

Epic 4 does not require Epic 2 or Epic 3 to complete or to be tested:

- Story 4.7's AC is explicit that it "confirms only the platform-level transport capability" — actually exercising 10 concurrent SSE connections is deferred to Epic 3 Story 3.11.
- The epic's own scope line explicitly excludes NFR-O1 verification (Epic 3 Story 3.8) and SSE-drain verification (Epic 3 Story 3.12) rather than silently assuming they'll exist.
- Story 4.11 explicitly defers NFR-O1 per-user LLM spend monitoring to Epic 3 Story 3.8, covering only platform-level uptime monitoring.
- Epic 4's only dependencies run *backward* to Epic 1 (Story 4.4 applies Epic 1's existing Prisma migrations; Story 4.5 wires `CREDENTIAL_ENCRYPTION_KEK` from Epic 1's envelope-encryption work) — backward dependencies on earlier epics are permitted by the standard.

### C. Story Sizing & Acceptance Criteria — ✓ Pass

All 12 stories use consistent Given/When/Then structure and are independently sized (one platform/concern per story). Stories are well-scoped:

- **Story 4.1** (Vercel project) — one platform, one concern. 2026-07-11 note confirms API automation is verified.
- **Story 4.2** (Railway project + Postgres) — one platform, one concern. 2026-07-11 note confirms API automation.
- **Story 4.3** (Dockerfile) — code-only, testable via local build + `/health`. Clean.
- **Story 4.4** (Prisma migrations) — one operation, testable against the Railway DB.
- **Story 4.5** (env vars/secrets) — one concern, both platforms. See Minor Finding #1 re: stale `AGENT_BACKEND_JWT_SECRET`.
- **Story 4.6** (CI deploy job) — one CI file, one job. Clean.
- **Story 4.7** (HTTP/2 confirmation) — one check, one result. Clean.
- **Story 4.8** (failure recovery/rollback) — runbook + verification. Clean.
- **Story 4.9** (custom domain) — deferred for MVP; transparently annotated.
- **Story 4.10** (database backups) — one concern + restore test + runbook. Clean.
- **Story 4.11** (monitoring) — external uptime checks + log retention confirmation. Clean.
- **Story 4.12** (secret rotation reminders) — runbook + GitHub Actions cron + issue creation. Clean.

### D. Dependency Analysis — ✓ Pass

Within-epic sequencing is explicit and backward-only:

- Story 4.2 acknowledges it precedes Story 4.3 ("service shell... pending Story 4.3's Dockerfile").
- Story 4.4 and 4.5 explicitly consume Story 4.2's `DATABASE_URL` output.
- Story 4.5's OAuth App callback URL depends on Story 4.1's Vercel URL.
- Story 4.6 depends on Stories 4.1 and 4.2 existing (deploy targets).
- Story 4.7 depends on Story 4.2 (agent-be deployed) and Story 4.3 (Docker image running).
- Story 4.8 depends on Stories 4.1–4.6 (deploy mechanism exists before rollback can be tested).
- Story 4.10 depends on Story 4.2 (Postgres instance exists).
- Story 4.11 depends on Stories 4.1 and 4.2 (both services deployed).
- Story 4.12 depends on Story 4.5 (secrets wired before rotation schedule makes sense).

This is normal build-order sequencing within a single epic, not prohibited forward dependencies between epics. The recommended execution order (4.1/4.2 → 4.3 → 4.4/4.5 → 4.6 → 4.7 → 4.8 → 4.10 → 4.11 → 4.12, with 4.9 skipped) matches the ACs' internal references.

### E. Database/Entity Creation Timing — ✓ Pass (N/A)

Story 4.4 applies pre-existing migrations from Epic 1; it creates no new tables, so the "tables created only when first needed" rule doesn't apply.

### F. Best Practices Compliance Checklist — Epic 4

- [x] Epic delivers user value — **fails literally, accepted as a deliberate exception (see A)**
- [x] Epic can function independently — pass (see B)
- [x] Stories appropriately sized — pass (see C)
- [x] No forward dependencies — pass (see D)
- [x] Database tables created when needed — pass / N/A (see E)
- [x] Clear acceptance criteria — pass, Given/When/Then throughout
- [x] Traceability to FRs maintained — pass: Epic 4 has no FR owner by design (correct); all Additional Requirements from architecture.md are mapped to stories

### Quality Assessment Documentation

#### 🟡 Minor Findings

**Minor Finding #1 — Stale `AGENT_BACKEND_JWT_SECRET` in Story 4.5 AC text:**

Story 4.5's AC text lists `AGENT_BACKEND_JWT_SECRET` as a required env var on both Vercel and Railway. The 2026-07-11 annotation on the story correctly identifies this as stale — the boundary JWT implementation (`boundary-jwt.guard.ts`, `streaming.controller.ts`) uses `AUTH_SECRET` for both signing and validation, not a separate key. The annotation instructs removing it, but the AC text itself has not been corrected.
- **Impact:** Low — the annotation is clear and the implementation already uses `AUTH_SECRET`. A developer reading the AC text without the annotation would set an unused env var.
- **Recommendation:** Correct the AC text to remove `AGENT_BACKEND_JWT_SECRET` from both lists and replace with a note that `AUTH_SECRET` (already listed) serves this purpose. Alternatively, fold the annotation into the AC text itself.

**Minor Finding #2 — Stale cross-reference in the master Requirements Coverage Map (`epics.md:212`):**

> **Resolved (2026-07-11):** Upon re-reading `epics.md:212`, this issue was already corrected. The line now correctly attributes "CI/CD manual deploy trigger, deployment infra" to Epic 4, not Epic 1. The correction note at `epics.md:214` confirms this was applied on 2026-07-03. The 2026-07-03 report flagged this correctly at the time — it has since been fixed. **No action needed.**

**Minor Finding #3 — Story 4.3 Dockerfile AC omits `prisma generate` in the build stage:**

Story 4.3's AC specifies a multi-stage build (install → `nx build agent-be` → slim runtime image) but does not mention a `prisma generate` step in the build stage. Story 4.1's AC (for `apps/web` on Vercel) explicitly includes "the build command includes a `prisma generate` step (from `libs/database-schemas`) before `nx build web`." Since `apps/agent-be` also imports `PrismaClient` from `@bmad-easy/database-schemas` (per project-context.md), the Dockerfile's build stage must also run `prisma generate` before `nx build agent-be`, or the build will fail.
- **Impact:** Medium-low — a developer implementing Story 4.3 will likely discover this when the build fails, but it's an omission in the AC that should be explicit for consistency with Story 4.1.
- **Recommendation:** Add an AC clause to Story 4.3: "And the build stage includes a `prisma generate` step (from `libs/database-schemas`) before `nx build agent-be`, so the shared Prisma client is available at build time."

**Minor Finding #4 — Story 4.6 references "Story 1.1 AC-4" but the epics file uses a different numbering:**

Story 4.6's "So that" clause references "Story 1.1 AC-4's original policy intent." In `epics.md`, Story 1.1's acceptance criteria are not numbered (they use `**Given**/**When**/**Then**` blocks without AC-1/AC-2/AC-4 labels). The "AC-4" reference appears to come from the implementation-artifact file (`1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md`) where ACs may have been numbered differently. This is a minor cross-reference inconsistency — a reader of `epics.md` alone cannot resolve "AC-4."
- **Impact:** Very low — the intent is clear from context (the "manual trigger" clause). But it's a traceability gap for someone reading only `epics.md`.
- **Recommendation:** Either number the ACs in Story 1.1's `epics.md` entry to match the implementation-artifact file, or change the reference to "Story 1.1's manual-trigger deploy clause" instead of "AC-4."

**Minor Finding #5 — Story 4.10 backup retention policy may exceed Railway's API capabilities:**

Story 4.10's AC specifies "retention policy of at least daily backups retained for 7 days and weekly backups retained for 4 weeks." The 2026-07-11 annotation on the story itself flags this uncertainty: "verify whether Railway's API supports configuring backup retention policy (daily/7d, weekly/4w) or just triggering ad-hoc backups — if retention config is dashboard-only, that specific sub-step remains manual." This is a known unknown that should be resolved before implementation, but the story transparently documents it.
- **Impact:** Low — the story is aware of the risk and has a fallback (manual dashboard configuration). No action needed on the story text itself; the uncertainty should be resolved at implementation time.
- **Recommendation:** No change to the story text. Resolve the uncertainty during implementation and update the AC if Railway's API doesn't support retention configuration.

#### Accepted Exceptions

**Accepted Exception #1 — Technical/infrastructure epic (no direct user value):**

Epic 4 is a technical/infrastructure epic with no direct user-facing value. This is a deliberate, already-approved decision from the Sprint Change Proposal (2026-07-03), not an oversight. See Epic Quality Review §A for full context.

**Accepted Exception #2 — Manual/human-executed steps within stories:**

Several stories require manual cloud-console access or human-only actions:
- Story 4.5: GitHub OAuth App callback URL update (no API exists for OAuth App management — transparently documented).
- Story 4.9: DNS configuration and OAuth App settings (deferred for MVP).

The 2026-07-11 annotations on Stories 4.1, 4.2, 4.8, and 4.10 confirm that API automation is verified for Vercel and Railway — a coding agent can execute these stories autonomously via the respective APIs. This supersedes the 2026-07-03 report's finding that Stories 4.1 and 4.2 lacked explicit "manual" annotations. **The original Minor finding from the 2026-07-03 report is resolved** — the 2026-07-11 notes provide the necessary clarity.

## Summary and Recommendations

### Overall Readiness Status

**READY** — Epic 4's structure, sequencing, story-level acceptance criteria, and scope boundaries are sound. The epic has grown from 7 stories (2026-07-03) to 12 stories, adding operational hardening coverage (rollback, backups, monitoring, secret rotation) that was missing from the original assessment. The previously-flagged Major finding (`ANTHROPIC_API_KEY` gap) is fully resolved. All 3 actionable minor issues (stale `AGENT_BACKEND_JWT_SECRET`, missing `prisma generate` AC, unclear "AC-4" reference) have been fixed. Finding #2 was found to be already resolved. Finding #5 is a known uncertainty to resolve at implementation time. Stories 4.1–4.8 and 4.10–4.12 can be picked up immediately; Story 4.9 is deferred for MVP.

### Critical Issues Requiring Immediate Action

None.

### Minor Issues to Address Before Implementation

1. **Story 4.5 AC text — remove stale `AGENT_BACKEND_JWT_SECRET`** (Minor Finding #1). **FIXED (2026-07-11):** Both Vercel and Railway AC clauses corrected — `AGENT_BACKEND_JWT_SECRET` removed, `AUTH_SECRET` remains as the sole JWT signing/validation key.

2. **`epics.md:212` master coverage map — remove "CI/CD, deployment infra" from Epic 1's entry** (Minor Finding #2). **Already resolved** — the line was corrected on 2026-07-03. No action needed.

3. **Story 4.3 AC — add `prisma generate` to the Dockerfile build stage** (Minor Finding #3). **FIXED (2026-07-11):** New AC clause added requiring `prisma generate` before `nx build agent-be` in the Dockerfile build stage.

4. **Story 4.6 — clarify "AC-4" reference** (Minor Finding #4). **FIXED (2026-07-11):** Changed "Story 1.1 AC-4's original policy intent" to "Story 1.1's manual-trigger deploy policy" — resolvable from `epics.md` alone without cross-file AC lookup.

5. **Story 4.10 — resolve Railway backup retention API uncertainty at implementation time** (Minor Finding #5). No story text change needed; the uncertainty is transparently documented. Resolve during implementation.

### Recommended Next Steps

1. ~~Apply the 3 one-line/two-line documentation fixes (Findings #1, #2, #4)~~ — **Done (2026-07-11).** Findings #1, #3, and #4 fixed via sub-agents. Finding #2 was already resolved.
2. ~~Add the `prisma generate` AC clause to Story 4.3 (Finding #3)~~ — **Done (2026-07-11).**
3. Begin implementation in the recommended order: 4.1/4.2 → 4.3 → 4.4/4.5 → 4.6 → 4.7 → 4.8 → 4.10 → 4.11 → 4.12. Skip 4.9 (deferred for MVP).
4. Resolve the Story 4.10 Railway backup retention API question during implementation (Finding #5) — if the API doesn't support retention configuration, document the manual step.
5. No action required on the Epic 4 user-value/technical-epic finding — it's a conscious, already-approved trade-off (Accepted Exception #1). Consider a standing "operational epic" exception note in `epics.md`'s conventions if this pattern repeats (e.g., Epic 6).

### What's Strong

- **Scope boundaries are precise.** Epic 4 explicitly excludes SSE-drain verification (Story 3.12) and spend monitoring (Story 3.8), correctly deferring them to Epic 3 where the underlying code lives. Story 4.7 confirms platform-level HTTP/2 capability only, not end-to-end SSE behavior. Story 4.11 explicitly defers NFR-O1 to Epic 3 Story 3.8. These boundaries prevent false confidence — each story owns only what it can actually verify.

- **The 2026-07-11 annotations are excellent.** They verify API automation for Stories 4.1, 4.2, 4.8, and 4.10 (superseding the 2026-07-03 "human-executed" notes), identify the stale `AGENT_BACKEND_JWT_SECRET`, confirm the existing OAuth App and secrets, and transparently defer Story 4.9. These annotations show active story maintenance and reduce implementation ambiguity.

- **Operational hardening is now comprehensive.** The expansion from 7 to 12 stories closes the gap between "provision the deployment" and "operate it safely." Stories 4.8 (rollback), 4.10 (backups), 4.11 (monitoring), and 4.12 (secret rotation) address the operational realities that the 2026-07-03 report implicitly flagged by their absence. The PRD's SOC 2 and EU Data Act guardrails don't have launch-blocking actions tied to Epic 4, and the stories don't pretend they do.

- **No forward dependencies.** Every within-epic dependency runs backward (4.2 → 4.3, 4.2 → 4.4/4.5, 4.1 → 4.5, 4.1/4.2 → 4.6/4.7, etc.). No story in Epic 4 requires Epic 2 or Epic 3 to be complete. The epic can be worked in parallel with Epic 6 (pending proposal) without blocking either.

- **The `ANTHROPIC_API_KEY` gap is fully closed.** The 2026-07-03 Major finding is resolved by the approved sandbox-secrets-hardening Sprint Change Proposal. Architecture, Story 3.1 ACs, and Story 4.5 ACs all now reflect the correct sourcing and the `networkAllowList` egress mitigation.

### Final Note

This assessment identified 5 minor issues and 2 accepted exceptions, all scoped to Epic 4. None block starting implementation. The 3 documentation fixes (Findings #1, #2, #4) are quick edits that should land alongside the first story pickup. The `prisma generate` AC addition (Finding #3) prevents a likely build failure. The Story 4.10 uncertainty (Finding #5) is transparently documented and should be resolved at implementation time. Epics 1–3 were not re-assessed here — see the 2026-07-02 report for that coverage. Epic 6 (Sandbox-Based Agent Execution) is a pending proposal not yet in `epics.md` and was not assessed.
