---
title: "Domains of Concern: bmad-easy"
status: draft
created: 2026-06-14
updated: 2026-06-14
---

# Domains of Concern: bmad-easy

| # | Domain | Description | Notes |
|---|--------|-------------|-------|
| 1 | **User Identity & Session Management** | Sign-up and sign-in via GitHub OAuth (primary) or email/password (fallback). Session lifetime, logout, account linking between auth methods. | Separate accounts per auth method unless explicitly linked. |
| 2 | **Trial Lifecycle** | 14-day free trial with no credit card required. Trial expiry detection, conversion prompt, full feature access during trial. | |
| 3 | **Authorization** | Seat-gated access to all platform features. Paywall redirect for unseated users. Upgrade prompt when seat or concurrent session limit is exceeded. | |
| 4 | **Git Authentication & Repository Connection** | PAT-based repository connection, BMAD initialization validation, commit attribution per user, credential health monitoring and re-auth flow. | PAT must be AES-256-GCM/KMS encrypted at rest. Every credential lookup requires a tenant authorization check before the PAT is resolved. |
| 5 | **UI — Project Map** | Home screen showing completed and in-progress Artifacts derived from the repository. Manual refresh, empty state, navigation to sessions and Artifact Browser. | No real-time push detection in MVP. |
| 6 | **UI — Skill Session Chat** | Streaming chat interface for running BMAD Skills. Slash-command skill entry, stop control, concurrent session management, session persistence, draft persistence across reconnects. | Max 10 concurrent active sessions per user. |
| 7 | **UI — Artifact Browser** | Read-only rendered Markdown view of committed Artifacts. Accessible from the Project Map and from Commit Pills. | |
| 8 | **Commit & Checkpoint** | Inline Commit Pills when the agent commits an Artifact. Platform-initiated Checkpoint saves the working tree on demand. Agent-idle lock prevents saves mid-turn. Proactive save prompt near session idle timeout. | Checkpoint bypasses the BMAD Agent — executed directly against the Sandbox via platform exec. |
| 9 | **Sandbox Infrastructure** | Daytona Cloud provisioning, lifecycle management, 30-minute idle pause, and sandbox termination on account deactivation. | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` is required in every Sandbox to prevent cross-session memory leakage. Daytona OSS is the documented continuity fallback. |
| 10 | **Claude Agent Runtime** | Claude Code harness running inside the Sandbox. Model hardcoded to `claude-sonnet-4-6`. Agent SDK credit pool billing. Internal AG-UI emitter (`ClaudeAgentSdkHarness`). | `tools: []` must be set on every SDK `query()` call to prevent the agent from executing tools outside its Sandbox. |
| 11 | **AG-UI Protocol & SSE Streaming** | Custom TypeScript emitter bridging the Claude Agent SDK to the AG-UI protocol (no official adapter exists). SSE back-pressure handling; HTTP/2 required at the load balancer. | Without HTTP/2, browsers cap SSE connections at 6 per origin — users with more than 6 open sessions will hang. |
| 12 | **Billing & Subscription** | Per-seat pricing at $25–$30/seat/month. Self-serve sales motion below $5K ACV; sales-assist above. Payment processing. Post-MVP: hybrid base-seat + usage passthrough model. | |
| 13 | **Spend Monitoring & Observability** | Per-user LLM cost tracking from day one. Budget alerting for anomalous per-user spend. Thresholds calibrated against the validated cost model at launch. | |
| 14 | **Compliance** | EU Data Act: data portability and switching rights must be in the architecture from launch — cannot be retrofitted. SOC 2 Type II: begin certification at approximately 6 months post-launch. | |
