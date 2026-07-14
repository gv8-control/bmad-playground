---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/research/technical-git-repository-authentication-multi-host-research-2026-06-13.md'
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Network security between agent-be (Railway) and the Daytona-hosted sandboxed Claude agent'
research_goals: 'Evaluate secure communication architecture between the NestJS agent-be backend (Railway-hosted) and Daytona-hosted sandboxes running the Claude Code agent: (1) whether a private network tunnel/VPC peering between Railway and Daytona is feasible and follows current best practice, (2) auth-token-based authentication for the sandbox-agent bridge, and (3) how this interacts with NFR-S2 (sandbox credential/network isolation) and the existing sandbox-agent/AG-UI event bridge design already captured in the in-progress architecture document.'
user_name: 'Marius'
date: '2026-06-16'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-06-16
**Author:** Marius
**Research Type:** technical

---

## Research Overview

This report evaluates how agent-be (the NestJS backend, Railway-hosted) should securely communicate with the Daytona-hosted sandbox running the Claude Code agent for bmad-easy. It was prompted by two candidate approaches — a private network tunnel between the sandbox and agent-be, and auth-token-based authentication for the sandbox-agent bridge — and tests both against how Daytona's platform actually connects a host application to a sandbox.

The central finding reframes the question: Daytona sandboxes are never directly network-addressable from outside Daytona's own control-plane proxy, which already terminates TLS and injects authentication before any request reaches a sandbox. A custom tunnel would therefore not add security — it would require giving the sandbox itself a network identity, inverting the isolation it's supposed to provide. The auth-token approach is the correct layer and is largely already implicit in the architecture: the Daytona API key agent-be holds is the only credential needed for this path. The research instead surfaces a more material risk already on record in the project's git-authentication research — credentials placed inside the sandbox (`GITHUB_TOKEN`, `ANTHROPIC_API_KEY`) are, by Daytona's own documented security guidance, exfiltratable by the agent itself — and recommends sandbox egress allow-listing as the concrete, low-effort mitigation. See the Executive Summary below and the full Strategic Recommendations section for details.

---

## Executive Summary

agent-be never needs a direct network path to a Daytona sandbox, and should not build one. Daytona's architecture routes every interaction — process execution, file system access, log streaming — through its own authenticated, TLS-terminating proxy; the sandbox has no network endpoint outside that proxy for a tunnel to attach to. The "auth token" half of the original question is already answered by Daytona's API-key model: agent-be authenticates to Daytona's control plane with a scoped bearer key, and the sandbox-side process (sandbox-agent) never initiates an outbound connection to agent-be — its output is pulled via an authenticated session/log-streaming call.

The research did surface a real, previously under-examined risk: per Daytona's own Security Exhibit, any secret placed inside a sandbox's environment (the project's `GITHUB_TOKEN` and `ANTHROPIC_API_KEY`, per existing research) is readable and exfiltratable by the agent process running there. This is not solved by a tunnel or a different auth scheme between agent-be and Daytona — it requires either network egress restriction (`networkAllowList`) so a leaked credential has nowhere useful to go, or a structural change routing git operations through agent-be itself rather than handing the raw token to the in-sandbox agent.

**Key Technical Findings:**

- Daytona sandboxes sit behind a host-based-routing proxy that authenticates and TLS-terminates every request; there is no sandbox-side network surface for a custom tunnel to attach to.
- agent-be is the only active/polling party in this relationship — sandbox-agent's JSONL output is pulled via Daytona's session/log-streaming API, not pushed by the sandbox.
- Daytona's own documentation states that environment-variable secrets inside a sandbox are exfiltratable by the agent — directly applicable to this project's existing `GITHUB_TOKEN`/`ANTHROPIC_API_KEY` injection pattern.
- Daytona's egress firewall (`networkAllowList`/`networkBlockAll`) is capped at 10 IPv4 CIDR entries with no hostname support, which is a real implementation constraint for allow-listing GitHub/Anthropic/registry traffic.
- No documented HMAC/signing mechanism exists for Daytona webhooks — a gap to confirm before depending on them for any trust-sensitive action.

**Technical Recommendations:**

1. Do not build a custom tunnel (WireGuard/Tailscale/Cloudflare Tunnel) between agent-be and the Daytona sandbox — Daytona's existing proxy + API-key model already provides the equivalent security property.
2. Treat the Daytona API key as a rotatable secret: Railway Sealed Variable, scoped per environment (dev/staging/production), rotated on a defined cadence.
3. Add `networkAllowList` egress restriction to the sandbox initialization sequence, scoped to GitHub, the Anthropic API, and required package registries, to close the exfiltration path for sandbox-resident credentials.
4. Treat any future Daytona webhook receiver as a low-trust input until Daytona confirms a signing mechanism; keep the current poll/stream pattern as the primary channel.
5. Flag host-mediated git operations (agent-be performs git push via Daytona's process API rather than handing the raw PAT to the in-sandbox agent) as a longer-term structural option for the architecture's risk register, not a Step 4 decision made here.

---

## Table of Contents

1. Technical Research Scope Confirmation
2. Technology Stack Analysis — Daytona Networking, Railway Networking, Tunnels, Service-to-Service Auth
3. Integration Patterns Analysis — How agent-be Actually Reaches the Sandbox
4. Architectural Patterns and Design — Tunnel vs. Auth Token, Credential Exposure, Defense in Depth
5. Implementation Approaches and Technology Adoption — Concrete Config, Testing, Risk Summary
6. Strategic Recommendations and Decision Matrix
7. Sources and Confidence

---

## Technical Research Scope Confirmation

**Research Topic:** Network security between agent-be (Railway) and the Daytona-hosted sandboxed Claude agent

**Research Goals:** Evaluate secure communication architecture between the NestJS agent-be backend (Railway-hosted) and Daytona-hosted sandboxes running the Claude Code agent: (1) whether a private network tunnel/VPC peering between Railway and Daytona is feasible and follows current best practice, (2) auth-token-based authentication for the sandbox-agent bridge, and (3) how this interacts with NFR-S2 (sandbox credential/network isolation) and the existing sandbox-agent/AG-UI event bridge design already captured in the in-progress architecture document.

**Technical Research Scope:**

- Architecture Analysis - design patterns, frameworks, system architecture
- Implementation Approaches - development methodologies, coding patterns
- Technology Stack - languages, frameworks, tools, platforms
- Integration Patterns - APIs, protocols, interoperability
- Performance Considerations - scalability, optimization, patterns

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-06-16

---

## Technology Stack Analysis

### Daytona Sandbox Networking and Access Control

Each Daytona sandbox runs with its own dedicated network stack (alongside its own kernel and filesystem) on a compute node called a **Runner**. Critically, **host applications never connect to a sandbox directly.** All traffic — both control operations (file system, git, process exec) and any exposed preview ports — is routed through Daytona's **proxy**, a dedicated HTTP proxy that does host-based routing (`{port}-{sandboxId}.{proxy-domain}`), resolves the target Runner, **injects authentication headers, and forwards the request** to the sandbox. Inside the sandbox, a code-execution agent (the **Toolbox API**) brokers file system/git operations, process and code execution, log streaming, and terminal sessions.

_Daytona API authentication: bearer **API keys** with defined scopes, generated per organization. The raw key is shown once at creation and not stored server-side._
_Source: [Architecture - Daytona](https://www.daytona.io/docs/en/architecture/)_
_Source: [API Keys - Daytona](https://www.daytona.io/docs/en/api-keys/)_
_Source: [API Keys and Scopes - DeepWiki daytonaio/daytona](https://deepwiki.com/daytonaio/daytona/7.2-api-keys-and-scopes)_

**Egress firewall controls** are configurable per sandbox via `networkAllowList` (comma-separated IPv4 CIDR blocks, max 10 entries, `/0`–`/32` required, no hostnames/domains/IPv6) and `networkBlockAll` (blocks all outbound; takes precedence over the allow list if both are set). On Tiers 1–2 this policy is organization-enforced and cannot be overridden per-sandbox; Tiers 3–4 default to full internet access and can call `updateNetworkSettings` to change the policy on a *running* sandbox (applied as iptables rules on the Runner). All tiers get pre-whitelisted access to package registries (npm, PyPI, Composer), GitHub/GitLab, container registries, cloud storage, and AI/ML APIs (Anthropic, OpenAI, Google AI) regardless of custom allow-list entries.
_Source: [Network Limits (Firewall) - Daytona](https://www.daytona.io/docs/en/network-limits/)_
_Source: [Dynamic Network Egress Control - daytonaio/daytona Issue #3357](https://github.com/daytonaio/daytona/issues/3357)_

**Webhooks** (Daytona → application, for `sandbox.created`/`sandbox.state.updated`/snapshot/volume events) require an HTTPS receiving endpoint. The published documentation does **not** describe an HMAC signing secret or other authenticity-verification mechanism for inbound webhook payloads — this is a gap to confirm directly with Daytona before relying on webhooks for any trust-sensitive lifecycle decision.
_Source: [Webhooks - Daytona](https://www.daytona.io/docs/en/webhooks/)_

### Railway (agent-be host) Networking

Railway's **Private Networking** provides encrypted WireGuard tunnels with internal DNS (`SERVICE_NAME.railway.internal`) — but explicitly **only between services inside the same Railway project**. It has no bearing on traffic leaving Railway toward an external provider like Daytona Cloud. **Static Outbound IPs** (Pro plan) assign a small pool of IPs (traffic load-balanced across them, not guaranteed dedicated) usable for destination-side allow-listing/firewalling, e.g. if Daytona's self-hosted control plane or a future egress firewall needed to allow-list agent-be's source IP.
_Source: [Private Networking - Railway Docs](https://docs.railway.com/networking/private-networking)_
_Source: [Static Outbound IPs - Railway Docs](https://docs.railway.com/networking/static-outbound-ips)_

### Tunnel / VPN Technologies (WireGuard, Tailscale, Cloudflare Tunnel)

For point-to-point private connectivity between two cloud-hosted services, the 2026 landscape converges on WireGuard-based mesh VPN (**Tailscale**, identity-based ACLs via SSO, zero-trust default-deny) versus **Cloudflare Tunnel** (`cloudflared` agent exposes a local service outward through Cloudflare's edge rather than building a private mesh). Both silently drop unauthenticated traffic and are considered current best practice for connecting two specific endpoints under your control.
_Source: [Tailscale vs Cloudflare Tunnel - Need to Know IT](https://needtoknowit.com.au/blog/tailscale-vs-cloudflare-tunnels-for-remote-access/)_
_Source: [Secure Remote Access: Tailscale vs WireGuard vs Cloudflare Tunnels - Low Power Home Server](https://www.lowerhomeserver.vip/blog/use-cases/secure-remote-access-comparison)_

**Applicability gap identified:** these tools assume you control both tunnel endpoints and can install an agent on each. A Daytona sandbox is ephemeral, created/destroyed per Conversation, and — per the Architecture section above — is **not directly addressable from outside Daytona's own proxy in the first place**. There is no sandbox-side network endpoint to attach a Tailscale/WireGuard peer to that would bypass Daytona's control plane; doing so would mean punching a hole in Daytona's own per-sandbox firewall and managing a VPN peer's lifecycle for every ephemeral sandbox — a workaround for a connection path Daytona's architecture does not actually expose. This materially narrows the design space considered in Step 4.

### Service-to-Service Authentication Patterns (mTLS vs Bearer Tokens)

2026 industry consensus (NIST SP 800-207-aligned): **mTLS authenticates the connection** (both ends prove identity, transport is encrypted) but **does not express authorization** — a valid certificate doesn't imply the caller is allowed to perform a given action. Plain OAuth2/bearer tokens are exposed to replay if intercepted; **RFC 8705 Certificate-Bound Access Tokens** bind a bearer token to the holder's mTLS certificate to close that gap. Practical 2026 guidance: a service mesh (Istio/Linkerd) for mTLS at scale is operational overhead not justified for a handful of services — for a small number of trusted service-to-service links, a scoped bearer token (such as Daytona's own API-key model, which already carries defined scopes) is consistent with current practice, **provided the token is treated as a credential at rest** (encrypted/secret-managed, rotated, scoped to the minimum needed permissions).
_Source: [Zero-Trust Service-to-Service Auth in 2026: mTLS, SPIFFE, and Identity Boundaries](https://thebackenddevelopers.substack.com/p/zero-trust-service-to-service-auth)_
_Source: [mTLS vs OAuth 2.0 for Service-to-Service Authentication - Security Boulevard](https://securityboulevard.com/2026/05/mtls-vs-oauth-2-0-for-service-to-service-authentication-a-technical-comparison/)_

**Confidence:** High for Daytona's proxy/auth/firewall architecture and Railway's networking scope (primary docs). Medium for Daytona webhook signing absence (documentation gap, not a confirmed negative — verify with Daytona support before depending on it). High for the general mTLS-vs-bearer-token industry framing (multiple cross-validated 2026 sources).

---

## Integration Patterns Analysis

### Communication Protocol: How agent-be Actually Reaches the Sandbox

The realistic integration pattern is **not** peer-to-peer networking but an **outbound-only, polling/streaming REST client** pattern: agent-be (Railway) calls the Daytona TypeScript SDK, which issues HTTPS requests to Daytona's control-plane API (bearer API-key auth, TLS) — there is no inbound port on Railway that Daytona or the sandbox needs to reach for this path. Concretely, for the sandbox-agent (rivet-dev) JSONL→AG-UI bridge:

- agent-be creates a Daytona **process session** (`sandbox.process.createSession`) and runs sandbox-agent inside it asynchronously (`executeCommand(..., { async: true })`).
- agent-be then calls `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)`, which **streams the session's stdout/stderr back to agent-be over the same authenticated HTTPS/SDK channel** — this is the transport that carries the JSONL events sandbox-agent emits, not a connection initiated by the sandbox itself.
- A documented gotcha: if a sandbox has `autoDeleteInterval` set, agent-be must explicitly call `deleteSession` before auto-delete fires, or the log-streaming connection is left dangling (known open issue, not auto-cleaned).
_Source: [Process and Code Execution - Daytona](https://www.daytona.io/docs/en/process-code-execution/)_
_Source: [Log Streaming - Daytona](https://www.daytona.io/docs/en/log-streaming/)_
_Source: [Process - Daytona TypeScript SDK](https://www.daytona.io/docs/en/typescript-sdk/process/)_
_Source: [Log Streaming Connection Not Cleaned Up on Sandbox Auto-Delete - daytonaio/daytona Issue #2510](https://github.com/daytonaio/daytona/issues/2510)_

This confirms the cross-cutting concern already captured in the architecture document (sandbox-agent reliability, circuit-breaker, SSE heartbeat) sits **downstream** of this transport: agent-be is the active/polling party against Daytona's API, and only re-emits to the browser over its own SSE channel once it has received sandbox-agent's output through that authenticated path.

### Integration Security Patterns (the part that answers the original question)

- **API Key Management:** The single secret agent-be holds for this integration is the **Daytona API key** (scoped, bearer). It should be stored as a Railway **Sealed Variable** (not readable back from the dashboard) rather than a plain environment variable, consistent with 2026 guidance to treat platform secrets as short-lived, rotatable, and revocable without a redeploy. If multiple agent-be instances/environments share the key, Railway **Shared Variables** let rotation happen in one place.
  _Source: [Managing Secrets on Railway - Railway Guides](https://docs.railway.com/guides/managing-secrets-on-railway)_
  _Source: [The Best Secrets Management Platforms for Cloud Apps in 2026 - Railway Blog](https://blog.railway.com/p/best-secrets-management-2026)_

- **Mutual TLS:** Not applicable as a custom build — agent-be never opens a raw socket to the sandbox; TLS termination and identity verification both happen at Daytona's proxy, which already injects auth headers before forwarding to the Runner/sandbox. Adding mTLS on top would require Daytona to support client-cert auth on its control-plane API, which is not part of its documented auth model (API keys / OAuth2 only).

- **Webhook signature verification:** If the architecture later adopts Daytona webhooks (e.g., to react to `sandbox.state.updated` without polling), this is the one path where Daytona *initiates* a connection toward agent-be — i.e., a genuinely inbound surface on Railway. Because no signing-secret/HMAC mechanism is documented, treat any such endpoint as **unauthenticated until confirmed otherwise with Daytona** — restrict it with a Railway-side shared-secret query parameter or path token at minimum, and do not use it as the sole trigger for any privileged action (e.g., tearing down credentials).

- **Data encryption in transit:** Already covered — Daytona's proxy and Railway's outbound HTTPS calls are TLS by default; no additional transport encryption layer is needed for the agent-be↔Daytona leg specifically.

**Confidence:** High for the session/log-streaming API shape and the "agent-be polls, sandbox never calls out to agent-be" direction (primary SDK docs, consistent across guides). Medium for webhook signing gap (absence of documentation, not a verified negative).

---

## Architectural Patterns and Design

### System Architecture Pattern: Why a Custom Tunnel Is the Wrong Layer

The two options raised at kickoff — (A) a private network tunnel between the sandbox and agent-be, (B) auth tokens for the sandbox-agent bridge — can now be evaluated against how the system actually connects, established in Steps 2–3:

- **Option A (custom tunnel) is not just unnecessary, it's structurally blocked.** A Daytona sandbox is not independently network-addressable from outside Daytona's own proxy; every sandbox sits behind Daytona's host-based-routing proxy, which already terminates TLS and injects auth headers before anything reaches the Runner. To build a WireGuard/Tailscale/Cloudflare Tunnel link "around" that, the sandbox would need an outbound-initiated tunnel client running as a process *inside* the agent's own workspace — i.e., a peer that lives and dies with an ephemeral, per-Conversation, agent-controlled sandbox. That inverts the trust model: the entity you're trying to keep isolated (the sandbox, which runs agent-directed arbitrary code) would be the one establishing and holding the tunnel's network identity. This is the same pattern Daytona's own security guidance warns against for credentials, generalized to network identity.
- **Option B (auth tokens) is the correct layer, and is already partially implemented.** The "token" in this architecture is the Daytona API key agent-be holds to authenticate *to Daytona's control plane* — there is no separate token sandbox-agent itself needs to manage or present, because sandbox-agent never initiates the connection; its output is pulled by agent-be over the already-authenticated session/log-streaming channel (Step 3). Per the standard service-to-service guidance researched in Step 2, the only thing left to harden is treating that Daytona API key as a rotatable secret (Railway Sealed Variable) and scoping it to the minimum permissions Daytona's API key scopes allow.

**Net finding: no new network-layer security primitive needs to be built.** Daytona's existing proxy + API-key model already provides the equivalent of "tunnel + token" (encrypted transport, authenticated, no direct sandbox exposure). The remaining architectural work is defense-in-depth *around* that channel, not a replacement for it.
_Source: [Architecture - Daytona](https://www.daytona.io/docs/en/architecture/) (cross-referenced with Step 2/3 findings)_

### Security Architecture Patterns: The Real Risk Is Credential Exposure Inside the Sandbox, Not the Wire

Daytona's own **Security Exhibit** states this directly: secrets injected into a sandbox via environment variables, mounted files, or the SDK's `envVars`/secrets option **can be read and exfiltrated by the agent running inside it** — "this applies even to short-lived or scoped credentials... [n]ever put secrets inside a sandbox." Daytona's recommended mitigation is to keep credentials in tools that run in the **host** environment (agent-be) and have the in-sandbox agent call those tools by name without ever seeing the underlying credential, or alternatively route the credential through a network proxy that injects it transparently.
_Source: [Security Exhibit - Daytona](https://www.daytona.io/docs/en/security-exhibit/)_

This is directly relevant to an existing decision already on record: the prior git-authentication research (`technical-git-repository-authentication-multi-host-research-2026-06-13.md`) specifies the GitHub PAT is **injected into the Daytona sandbox at creation as a `GITHUB_TOKEN` env var** so the Claude Agent SDK can run `git` directly inside the sandbox; the Claude Agent SDK's `ANTHROPIC_API_KEY` is injected the same way per the Step 1 isolation research. Both are, by Daytona's own definition, exfiltratable by the agent process they're handed to — a prompt-injection or compromised-dependency scenario inside the sandbox could attempt to exfiltrate either credential over the network.

**This reframes the cross-cutting concern already flagged in the architecture document** ("platform-internal credentials must not reach Sandbox," NFR-S2/S3) — the per-user GitHub token and the Anthropic key are not "platform-internal" in the sense the architecture meant, but they *are* sandbox-resident secrets with exactly the exfiltration exposure Daytona warns about. Two layered mitigations, escalating in effort:

1. **Egress allow-listing (cheap, available now):** Set `networkAllowList` on every sandbox to the minimum CIDR set covering GitHub, the Anthropic API, and the package registries the agent legitimately needs — `networkBlockAll` for everything else. This doesn't stop the agent from *reading* the token, but it closes the exfiltration path: a stolen `GITHUB_TOKEN` or `ANTHROPIC_API_KEY` is far less useful if the only network egress available is to the same providers the token is already scoped to. This is a direct, low-effort implementation of NFR-S2's "network isolation" half and should be added to the architecture's Sandbox initialization sequence (provision → apply `networkAllowList` → clone → inject git config → ...).
2. **Host-mediated git operations (higher effort, structural fix):** Following Daytona's own recommended pattern, git push/commit could be executed by agent-be itself via the Daytona process-execution API (the same mechanism already used for FR-15's platform-level manual commit) using a credential helper that never writes the raw PAT into the sandbox's environment — instead of letting the in-sandbox Claude Agent SDK invoke `git` with an embedded token. This is a larger change to the current tool-execution model and is flagged here as a finding for the architecture's risk register rather than a Step 4 decision to make unilaterally.

**Confidence:** High — Daytona's Security Exhibit is a primary, authoritative source stating this risk in its own documentation, and it's a generalizable, widely-stated 2026 pattern (also surfaced independently in the defense-in-depth research below).

### Defense-in-Depth Pattern (Confirms Existing Direction)

2026 industry consensus for AI coding-agent sandboxes is explicitly **defense-in-depth — compute isolation + filesystem restrictions + network controls + resource limits — with no single layer sufficient alone**, and credential scoping guidance of "give the agent nothing it doesn't explicitly need; a leaked credential should be useless within minutes." This validates that Daytona's container-level isolation (already evaluated and accepted in the prior isolation research, ADR A-2) being paired with the `networkAllowList` egress control recommended above is the appropriate combination for this architecture's risk tolerance — it does not by itself require upgrading to microVM isolation (Firecracker/Kata), which remains the documented post-MVP escalation path if adversarial use is detected.
_Source: [Defense in Depth AI Cybersecurity: Complete Guide 2026 - SentinelOne](https://www.sentinelone.com/cybersecurity-101/cybersecurity/defense-in-depth-ai-cybersecurity/)_
_Source: [AI Agent Sandbox: How to Safely Run Autonomous Agents in 2026 - Firecrawl](https://www.firecrawl.dev/blog/ai-agent-sandbox)_

### Deployment and Operations Architecture

- **Per-environment Daytona organizations/API keys:** Use separate Daytona API keys (and, if on a self-hosted/enterprise plan, separate organizations) per deployment environment (dev/staging/production) so a leaked staging key cannot reach production sandboxes. Store as a Railway Sealed Variable; rotate on a defined cadence and immediately on suspected exposure (Step 2/3 findings).
- **Egress-denial observability:** Daytona's `updateNetworkSettings`/firewall is enforced as iptables rules on the Runner; ensure denied-egress attempts are visible (via sandbox logs or Daytona's own monitoring, if exposed) so an attempted exfiltration attempt surfaces as an operational signal, not a silent failure.
- **Webhook endpoint hardening (if adopted later):** Given the documented absence of a Daytona webhook-signing mechanism (Step 3), any future webhook receiver on agent-be should be treated as a low-trust input — validate payload shape strictly, do not let it trigger irreversible actions alone, and prefer the existing poll/stream pattern already in use for sandbox-agent output.

**Confidence:** Medium-High — these are direct, low-risk extrapolations from the primary findings above rather than independently sourced claims.

---

## Implementation Approaches and Technology Adoption

### Concrete Implementation: Sandbox Provisioning with Egress Allow-listing

The egress allow-list recommendation from Step 4 slots directly into the architecture document's existing ordered sandbox-init sequence (provision → clone → inject git config → ...). It is a single additional field on the existing `daytona.create()` call already planned for `SandboxService`:

```typescript
const sandbox = await daytona.create({
  language: 'python',
  envVars: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    GITHUB_TOKEN: encryptedToken, // per-user, decrypted just-in-time
  },
  networkAllowList: [
    '140.82.112.0/20',   // github.com web/API ranges (example — verify current GitHub meta API ranges at provision time, not hardcoded)
    '185.199.108.0/22',  // GitHub Pages/raw content CDN (example)
    // Anthropic API and package-registry CIDRs to be resolved the same way
  ].join(','),
  autoStopInterval: 60, // matches the already-documented idle-timeout tunable
});
```

**Operational caveat surfaced by this implementation step:** GitHub, npm, and Anthropic do not publish small, stable CIDR blocks suitable for a 10-entry allow-list in all cases — GitHub does publish a [meta API](https://api.github.com/meta) with current IP ranges, but those ranges change periodically and Daytona's allow-list is capped at 10 CIDR entries with **no hostname support**. This is a real implementation constraint, not a theoretical one: the allow-list must be built from GitHub's `/meta` endpoint (or a maintained subset) at deploy time, with a documented process for refreshing it, rather than a one-time hardcoded list. If the 10-entry cap can't cover all required destinations reliably, the fallback is to accept default (broader) egress for the affected sandboxes and rely on the credential-scoping/rotation layer as the primary mitigation instead.

### Testing and Verification Practices

- **Negative test for egress control:** As part of the sandbox provisioning test suite, assert that a sandbox with `networkAllowList` applied cannot reach an arbitrary non-allow-listed host (e.g., attempt `curl` to a test endpoint outside the list and assert failure) — this is the only way to catch a misconfigured or silently-ignored allow-list before it reaches production, given `networkBlockAll` silently takes precedence if both fields are set.
- **Session/log-streaming cleanup test:** Given the documented Daytona issue (log-streaming connections not cleaned up on sandbox auto-delete), add a test asserting `deleteSession` is called before any sandbox with `autoStopInterval`/`autoDeleteInterval` set is allowed to expire, to avoid leaking streaming connections under load.
- **Secret-rotation drill:** Periodically rotate the Daytona API key in a non-production environment and confirm agent-be picks up the new value without a code change (validates the Sealed/Shared Variable wiring from Step 3).

### Deployment and Operations Practices

- **Per-environment isolation:** dev/staging/production should use distinct Daytona API keys at minimum (Step 4); if Daytona's plan tier supports separate organizations, prefer that over key-only separation.
- **Monitoring:** Surface sandbox provisioning failures and (if accessible) egress-deny events into the same observability path already planned for LLM cost reporting (NFR-O1), so a spike in denied egress attempts is visible as an anomaly signal — this is also the documented post-MVP "abuse signal" the architecture's Sandbox isolation risk item (#8) already anticipates needing.

### Risk Assessment and Mitigation Summary

| Risk | Severity | Mitigation | Effort |
|------|----------|------------|--------|
| Custom tunnel built to "secure" sandbox↔agent-be link | N/A (avoided) | Don't build it — Daytona's proxy/API-key model already covers this; building a parallel tunnel would require giving the sandbox itself a network identity, the opposite of isolation | None (avoidance) |
| `GITHUB_TOKEN` / `ANTHROPIC_API_KEY` exfiltration from inside sandbox via agent-directed network call | Medium-High | `networkAllowList` egress restriction (Step 4) | Low |
| Allow-list can't be kept current/complete (10-entry CIDR cap, IP ranges change) | Medium | Automate allow-list refresh from provider `/meta` endpoints; accept residual risk and lean on credential scoping/rotation as backstop | Medium |
| Daytona API key compromise (single static secret) | Medium | Sealed Variable storage, per-environment keys, rotation cadence | Low |
| Future Daytona webhook adoption with no documented signing mechanism | Low (not yet in use) | Treat webhook payloads as low-trust; confirm signing support with Daytona before relying on them for privileged actions | Low |
| Log-streaming connection leak on sandbox auto-delete | Low | Explicit `deleteSession` before expiry; covered by a test | Low |

**Confidence:** High for the implementation constraints documented directly in Daytona's own docs/issues (10-entry CIDR cap, log-streaming cleanup issue). Medium for the specific GitHub IP ranges shown above — these are illustrative only and must be resolved from GitHub's live `/meta` API, not copied from this document.

---

## Strategic Recommendations and Decision Matrix

### Decision Matrix: Original Options vs. What Daytona's Architecture Actually Supports

| Option considered | Feasible? | Verdict |
|---|---|---|
| Private network tunnel (WireGuard/Tailscale/Cloudflare Tunnel) between sandbox and agent-be | No sandbox-side endpoint exists to attach a tunnel peer to | **Reject** — would require punching a hole in Daytona's per-sandbox firewall and giving an ephemeral, agent-controlled sandbox a persistent network identity; Daytona's proxy already provides authenticated, encrypted routing without this |
| Auth tokens for the sandbox-agent bridge | Already the model in use | **Adopt and harden** — the token is the Daytona API key agent-be holds; sandbox-agent itself never needs or presents a separate credential because it never initiates the connection |
| Egress allow-listing on the sandbox (not originally raised, surfaced by this research) | Available now (`networkAllowList`, 10-entry IPv4 CIDR cap) | **Adopt** — directly mitigates the credential-exfiltration risk identified in Step 4, and is the concrete implementation of NFR-S2's network-isolation half |
| Host-mediated git operations (not originally raised, surfaced by this research) | Requires restructuring how git push/commit reaches the sandbox | **Defer to architecture risk register** — higher-effort structural fix, worth evaluating but not required to close the original network-security question |

### Phased Approach

```
Now:        Keep current Daytona SDK integration (session + log-streaming, API-key auth).
            No tunnel work needed — already secure at the transport layer.
            ↓
Next:       Add networkAllowList to SandboxService.provision() in the sandbox-init
            sequence; store Daytona API key as a Railway Sealed Variable, scoped
            per environment.
            ↓
Post-MVP:   Evaluate host-mediated git credential handling if the prompt-injection
            threat model for adversarial use (already flagged in the architecture's
            risk register, item #8) escalates beyond "authenticated, non-adversarial
            users."
```

---

## Sources and Confidence

### Key Sources

| Source | Relevance |
|--------|-----------|
| [Architecture - Daytona](https://www.daytona.io/docs/en/architecture/) | Proxy/Runner/Toolbox API model — confirms no direct sandbox network address |
| [Network Limits (Firewall) - Daytona](https://www.daytona.io/docs/en/network-limits/) | `networkAllowList`/`networkBlockAll` mechanics and constraints |
| [Security Exhibit - Daytona](https://www.daytona.io/docs/en/security-exhibit/) | Primary source for the in-sandbox credential exfiltration risk |
| [Process and Code Execution - Daytona](https://www.daytona.io/docs/en/process-code-execution/) / [Log Streaming - Daytona](https://www.daytona.io/docs/en/log-streaming/) | Session/log-streaming transport that carries sandbox-agent's output to agent-be |
| [API Keys - Daytona](https://www.daytona.io/docs/en/api-keys/) | Bearer API-key auth model for the Daytona control plane |
| [Private Networking - Railway Docs](https://docs.railway.com/networking/private-networking) | Confirms Railway's WireGuard private networking is intra-project only, not applicable to Daytona |
| [Managing Secrets on Railway - Railway Guides](https://docs.railway.com/guides/managing-secrets-on-railway) | Sealed/Shared Variable model for storing the Daytona API key |
| [Zero-Trust Service-to-Service Auth in 2026 - The Backend Developers](https://thebackenddevelopers.substack.com/p/zero-trust-service-to-service-auth) | mTLS-vs-bearer-token framing applied to this integration |
| `technical-git-repository-authentication-multi-host-research-2026-06-13.md` (this project) | Confirms `GITHUB_TOKEN` is injected as a sandbox env var — the existing decision this research's credential-exposure finding applies to |

### Confidence

- **High:** Daytona's proxy/auth/firewall architecture, session/log-streaming transport, API-key auth model, Security Exhibit's credential-exfiltration warning, Railway's private-networking scope (all primary, official documentation).
- **Medium:** Daytona webhook signing-mechanism absence (documentation gap, not a confirmed negative — verify directly with Daytona); illustrative GitHub CIDR ranges in the implementation snippet (must be resolved live from GitHub's `/meta` API, not hardcoded from this document).
- **Low/verify:** Exact Daytona pricing-tier boundaries for who can call `updateNetworkSettings` on a running sandbox — tier names/capabilities evolve; verify against live Daytona docs before relying on this for a specific plan.

---

**Technical Research Completion Date:** 2026-06-16
**Research Period:** Current state as of June 2026
**Source Verification:** All technical facts cited with current sources
**Technical Confidence Level:** High — based on multiple authoritative, cross-validated sources, with explicit medium/low flags on documentation gaps

_This technical research document evaluates secure communication between agent-be and the Daytona-hosted sandboxed Claude agent, concluding that Daytona's existing proxy and API-key model already satisfies the network-security intent behind both originally proposed options, and redirecting the architecture's attention to the more material risk of sandbox-resident credential exfiltration._
