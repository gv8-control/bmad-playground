---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Git Repository Authentication for Multi-Host Platforms'
research_goals: 'Evaluate platform-agnostic git authentication approaches (SSH keys, tokens, credentials); assess multi-faceted strategy with GitHub-first onboarding (OAuth App / GitHub App) plus universal git support for GitLab, Bitbucket, Gitea, self-hosted, etc.'
user_name: 'Marius'
date: '2026-06-13'
web_research_enabled: true
source_verification: true
---

# Git Repository Authentication for Multi-Host Platforms

**Date:** 2026-06-13
**Author:** Marius
**Research Type:** Technical

---

## Research Overview

This report evaluates authentication strategies for a platform that connects to user-owned git repositories hosted across multiple providers (GitHub, GitLab, Bitbucket, Azure DevOps, Gitea/Forgejo, and generic self-hosted git). It also covers push-notification strategies so the platform can react when users push to their source-of-truth repositories.

The research recommends a **two-tier approach**: a first-class GitHub App integration that dramatically reduces onboarding friction for GitHub users, combined with a universal credential layer (HTTPS Personal Access Token or SSH key) that works for every other provider. Webhook registration is automated where the provider API allows it, with polling as a universal fallback.

All claims are sourced from official provider documentation and current technical literature (2024–2026).

---

## MVP Scope

> **Read this first.** These decisions govern the MVP private beta. The full architecture in this document is the post-MVP target state. Downstream BMAD skills (PRD, Architecture) should operate from the MVP decisions below and treat the full research as a reference for future phases.

### Decision 1 — GitHub Only

bmad-easy MVP supports GitHub repositories only. GitLab, Bitbucket, Azure DevOps, Gitea/Forgejo, and generic git are deferred. The `GitCredentialProvider` abstraction interface is not built for MVP.

- **In MVP:** Single GitHub integration path.
- **Out of MVP:** All non-GitHub providers; the multi-provider credential abstraction layer.
- **Migration trigger:** Add the second provider when a paying customer explicitly requests it.

### Decision 2 — Fine-Grained PAT, Not GitHub App

ADR-002 (below) recommends GitHub App as the right long-term model. For MVP, a fine-grained GitHub PAT pasted by the user is used instead. GitHub App requires RSA key management, server-side JWT signing, and an installation token exchange flow — overhead not justified before product-market fit.

**MVP auth flow:**

1. During repo connection, the platform UI prompts for a fine-grained GitHub PAT with a step-by-step generation guide.
2. Required scope: specific repository + `contents:write` only.
3. PAT stored encrypted (AES-256-GCM) in the platform database.
4. Injected into the Daytona sandbox at creation as `GITHUB_TOKEN` env var.
5. Clone URL format: `https://x-access-token:{PAT}@github.com/{owner}/{repo}.git`
6. Commit authorship set independently via `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` sandbox env vars — the PAT is transport-only and does not affect `git log` attribution.

**Push notifications (MVP):** No webhook registration. The Project Map reads repository state on page load via the GitHub REST API using the stored PAT. Real-time push detection is post-MVP.

**Acceptable compromise:** Fine-grained PAT generation requires a manual step during onboarding. The user audience (developer champions assisting non-dev teammates) can follow a step-by-step guide in the UI. Fine-grained PATs are scoped to a single repository — more restrictive than a classic OAuth scope.

**Migration trigger:** Implement GitHub App (ADR-002) when beta feedback identifies PAT-generation friction as a material onboarding activation blocker.

---

## Technology Stack Analysis

### Git Client Libraries (Programmatic Git Operations)

Platforms that need to clone, fetch, or inspect repositories server-side must choose a git library. The main options:

| Library | Language | Auth Support | Notes |
|---------|----------|-------------|-------|
| **go-git** (`github.com/go-git/go-git/v5`) | Go | SSH, HTTPS/BasicAuth | Pure Go, no CGo, easy cross-platform deployment |
| **libgit2** (+ git2go, pygit2, nodegit) | C + bindings | SSH (via LibSSH2), HTTPS (via OpenSSL) | Most feature-complete; CGo required for Go; thread-safety caveats |
| **JGit** | Java/JVM | SSH, HTTPS | Standard in Jenkins/Eclipse ecosystems |
| **git CLI subprocess** | Any | Delegates to system git + credential helpers | Simplest; requires git binary installed |

**go-git** is the natural choice for a Go backend: no CGo, supports both SSH and HTTPS credential callbacks, and covers all required plumbing operations (clone, fetch, ls-refs). For SSH authentication, go-git accepts in-memory private key material — no need to write keys to disk.

_Source: [go-git Go Packages](https://pkg.go.dev/github.com/go-git/go-git/v5), [libgit2 Authentication Guide](https://libgit2.org/docs/guides/authentication/)_

### Credential Management at the Platform Layer

**Git Credential Manager (GCM)** is an open-source, cross-platform tool (GitHub / git-ecosystem) that provides a unified authentication experience for HTTPS remotes. It supports GitHub, GitLab, Bitbucket, and Azure DevOps natively, and delegates to OS-provided keystores (Windows Credential Manager, macOS Keychain, Linux Secret Service / GPG). GCM is primarily a _developer workstation_ tool; a server-side platform must implement its own equivalent abstraction.

For a SaaS platform, the equivalent is:
- An encrypted per-user, per-provider credential record in the database (AES-256-GCM)
- SSH private keys stored in HashiCorp Vault or an equivalent secrets manager
- OAuth refresh tokens stored as encrypted database columns with per-tenant encryption keys

_Source: [GCM GitHub](https://github.com/git-ecosystem/git-credential-manager), [GCM Blog](https://github.blog/security/application-security/git-credential-manager-authentication-for-everyone/)_

### Secrets Storage Options

| Option | Fit for SaaS | Notes |
|--------|-------------|-------|
| **HashiCorp Vault** | High | Dynamic secrets, transit encryption, audit log; HCP Vault Secrets is the managed SaaS variant |
| **AWS Secrets Manager / GCP Secret Manager** | High | Cloud-native, per-secret IAM, automatic rotation |
| **Encrypted DB column** (AES-256-GCM) | Medium | Simpler ops; no automatic rotation; envelope-encrypt with KMS |
| **OS keystore** | Not applicable | Desktop-only |

_Source: [HCP Vault Secrets](https://developer.hashicorp.com/hcp/docs/vault-secrets), [SaaS Data Isolation with HashiCorp Vault (AWS Blog)](https://aws.amazon.com/blogs/apn/saas-data-isolation-with-dynamic-credentials-using-hashicorp-vault-in-amazon-eks/)_

---

## Authentication: Provider-by-Provider Analysis

### GitHub (Recommended: GitHub App)

GitHub offers two first-party integration mechanisms and raw PATs:

**GitHub App** (strongly recommended for platform integrations)
- Operates independently of any user; survives user departures from an organization
- Fine-grained, repository-scoped permissions — users can limit which repos the app accesses
- Issues short-lived **installation access tokens** (1-hour TTL) via `POST /app/installations/{id}/access_tokens`
- Token used for git over HTTPS: `https://x-access-token:{TOKEN}@github.com/{owner}/{repo}.git`
- Can programmatically register webhooks at installation time with no user interaction
- Requires registering an app in GitHub, generating a private key (RSA), and signing JWTs server-side to exchange for installation tokens

**OAuth App**
- User-delegated: can only act on behalf of a user, not independently
- No per-repository granularity — access to _all_ repos the user can see
- Simpler to implement for pure authentication/identity use cases (login, profile sync)
- Not recommended for ongoing background git operations

**Personal Access Token (PAT)**
- Classic PAT: broad scopes, no expiry enforcement
- Fine-grained PAT (2022+): repository-scoped, expiry required, audit-logged
- Simplest integration; no app registration; user pastes token into platform

**Recommendation for platform onboarding:** GitHub App provides the best combination of security, user trust (explicit install UI showing which repos are shared), and operational reliability. It is the model used by Vercel, Netlify, Railway, and similar platforms.

_Source: [GitHub Docs – Differences between GitHub Apps and OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps), [GitHub App installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation), [Nango Blog – GitHub App vs OAuth](https://nango.dev/blog/github-app-vs-github-oauth/)_

---

### GitLab (Cloud and Self-Hosted)

GitLab supports OAuth 2.0 and multiple token types:

**OAuth 2.0**
- Standard authorization code flow
- Required scopes for git access: `read_repository` (clone/fetch) and/or `write_repository` (push)
- HTTPS clone format: `https://oauth2:{TOKEN}@gitlab.example.com/{path}.git`
- Tokens can be refreshed using the refresh token; GitLab returns expiry metadata

**Personal Access Token**
- User-generated; same HTTPS clone format using `oauth2` as username
- Scopes: `read_repository`, `write_repository`, `api` (for webhook registration via API)

**Project Access Token**
- Scoped to a single project; ideal for least-privilege integration
- Available on GitLab SaaS (paid tiers) and self-hosted CE/EE

**Self-Hosted Consideration:** The same OAuth 2.0 / PAT mechanisms apply; the platform must store the instance base URL per-user and construct API and clone URLs dynamically.

_Source: [GitLab OAuth 2.0 Docs](https://docs.gitlab.com/api/oauth2/), [GitLab Token Overview](https://docs.gitlab.com/security/tokens/), [GitLab PAT Docs](https://docs.gitlab.com/user/profile/personal_access_tokens/)_

---

### Bitbucket (Cloud and Data Center)

**Bitbucket Cloud**
- OAuth 2.0 (authorization code flow); scopes include `repository:read`, `repository:write`
- App passwords: user-generated, scoped credentials used as HTTPS basic auth (username + app password)
- Workspace Access Tokens: organization-level tokens

**Bitbucket Data Center (self-hosted)**
- Personal Access Tokens (HTTP header: `Authorization: Bearer {token}`)
- Same HTTPS clone mechanism; token replaces password in URL or Authorization header
- Note: Azure DevOps integration with Bitbucket Cloud uses OAuth or HTTP Basic only

**Credential format for HTTPS clone:**
`https://{username}:{app_password_or_PAT}@bitbucket.org/{workspace}/{repo}.git`

_Source: [Databricks – Get access tokens from git providers](https://docs.databricks.com/aws/en/repos/get-access-tokens-from-git-provider), [Azure Docs – Authenticate with git repos](https://learn.microsoft.com/en-us/azure/devops/repos/git/auth-overview?view=azure-devops)_

---

### Azure DevOps

**Personal Access Tokens (PATs)**
- 84-character tokens; the AZDO signature appears at positions 76–80
- Scopes: `Code (Read)`, `Code (Read & Write)` for git operations
- HTTPS clone: `https://{org}:{PAT}@dev.azure.com/{org}/{project}/_git/{repo}`

**Microsoft Entra (Azure AD) OAuth**
- Modern, recommended for enterprise; standard OAuth 2.0 authorization code flow
- Scope: `499b84ac-1321-427f-aa17-267ca6975798/.default` (Azure DevOps resource)
- Short-lived access tokens with refresh token support

**Service Hooks for Webhooks:** Azure DevOps calls its outbound webhook system "Service Hooks." Subscriptions are created via REST API (`POST /{org}/_apis/hooks/subscriptions`) with `eventType: "git.push"`. Requires HTTPS endpoints.

_Source: [Azure DevOps PAT Docs](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops), [Service Hooks REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/hooks/?view=azure-devops-rest-7.1)_

---

### Gitea / Forgejo (Self-Hosted)

Gitea (and its community fork Forgejo, which split in 2022 over governance concerns) are lightweight, self-hosted git platforms that are API-compatible for core operations:

- **PAT**: generated via web UI or `POST /api/v1/user/tokens`
- **OAuth 2.0**: Gitea/Forgejo can act as an OAuth provider; supports authorization code flow
- **SSH keys**: standard; upload via `POST /api/v1/user/keys`
- **HTTPS clone**: `https://{user}:{PAT}@{host}/{owner}/{repo}.git`
- **Webhooks**: fully supported via `POST /api/v1/repos/{owner}/{repo}/hooks`; push events available; payload format is similar to GitHub

Forgejo maintains API compatibility with Gitea for these core operations as of 2026.

_Source: [n8n – Webhook and Gitea](https://n8n.io/integrations/webhook/and/gitea/), [TechVerdict – Self-Hosted Git 2026](https://www.techverdict.io/articles/self-hosted-git-2026)_

---

### Generic / Plain Git (Bare Repositories, No Hosting Platform)

For bare git repos without a hosting platform (e.g., git server over SSH on a VPS):
- **SSH key authentication**: universal, no token management; platform generates a key pair per user-repo, uploads the public key to the server's `~/.ssh/authorized_keys`
- **HTTPS basic auth**: supported if the server runs a git HTTP backend (e.g., nginx + git-http-backend); credentials via URL
- **Push notification**: no native webhook — relies on `post-receive` server-side hooks or polling (see Webhooks section below)

---

## Universal / Platform-Agnostic Authentication Model

Across all providers, one transport + credential format works universally:

**HTTPS + token as password**
```
https://<username>:<token>@<host>/<owner>/<repo>.git
```

The `username` value varies per provider:
| Provider | Username | Token |
|----------|----------|-------|
| GitHub (App) | `x-access-token` | Installation access token |
| GitHub (PAT) | any non-empty string or actual username | PAT |
| GitLab | `oauth2` | OAuth token or PAT |
| Bitbucket | actual username | App password or PAT |
| Azure DevOps | any | PAT or Entra OAuth token |
| Gitea/Forgejo | actual username | PAT |
| Generic HTTP git | actual username | password or PAT |

**SSH key authentication** is the other universal method: same protocol across all providers. The platform generates an RSA or Ed25519 key pair server-side per user (or per user-provider), stores the private key in a secrets store, and registers the public key with the provider via API.

**Recommended abstraction:**

```
interface GitCredentialProvider {
  buildCloneURL(repo: RepoRef): string          // returns authenticated HTTPS URL
  getSSHPrivateKey(repo: RepoRef): PrivateKey   // for SSH transport
  refreshIfNeeded(): Promise<void>              // for OAuth token refresh
}

Implementations:
├── GitHubAppCredentialProvider     // JWT → installation token, auto-refresh
├── GitLabOAuthCredentialProvider   // OAuth2 refresh token flow
├── BitbucketCredentialProvider     // OAuth2 or app password
├── AzureDevOpsCredentialProvider   // Entra OAuth or PAT
├── GiteaCredentialProvider         // PAT
└── GenericHTTPSCredentialProvider  // username:PAT for any provider
└── GenericSSHCredentialProvider    // SSH key pair for any provider
```

Each implementation stores its credentials encrypted and knows how to construct a valid clone URL or SSH context for its provider. The platform code that clones/fetches repositories only calls `buildCloneURL()` — it is provider-agnostic.

---

## Push Notifications: Webhooks and Fallback Strategies

### Webhook Comparison by Provider

| Provider | Webhook API | Push Event Key | Signature Header | Signature Algorithm |
|----------|------------|----------------|-----------------|-------------------|
| GitHub | `POST /repos/{owner}/{repo}/hooks` | `push` | `X-Hub-Signature-256` | HMAC-SHA256 |
| GitLab | `POST /api/v4/projects/{id}/hooks` | `Push Hook` | `X-Gitlab-Token` | Shared secret (plain, not HMAC) |
| Bitbucket Cloud | `POST /2.0/repositories/{ws}/{slug}/hooks` | `repo:push` | `X-Hub-Signature` | HMAC-SHA256 |
| Azure DevOps | `POST /{org}/_apis/hooks/subscriptions` | `git.push` | none (IP allowlist) | None built-in |
| Gitea/Forgejo | `POST /api/v1/repos/{owner}/{repo}/hooks` | `push` | `X-Gitea-Signature` | HMAC-SHA256 |
| Generic git | N/A | N/A | N/A | N/A |

**GitHub webhook auto-registration via GitHub App:** A GitHub App can register a webhook at the organization or repository level automatically upon installation. The platform receives `installation` and `installation_repositories` events when users add/remove repos — no manual webhook setup by the user.

### Webhook Security

For providers using HMAC-SHA256 (GitHub, Bitbucket, Gitea/Forgejo):
1. Compute `HMAC-SHA256(secret, rawPayloadBytes)`
2. Compare with `X-Hub-Signature-256` header using **timing-safe comparison** (never plain `==`)
3. Reject with HTTP 401/403 on mismatch
4. GitHub recommends the `X-Hub-Signature-256` header over the deprecated `X-Hub-Signature` (SHA1)
5. The HMAC is computed on the **raw bytes** of the payload — never parse JSON first

For GitLab: compare `X-Gitlab-Token` header value directly against the configured secret (plain string equality is acceptable here since GitLab doesn't use HMAC).

For Azure DevOps: service hooks do not include a signature header. Mitigation: use a hard-to-guess webhook URL path (UUID-based), enforce TLS, and optionally validate the source IP against Azure DevOps published IP ranges.

_Source: [GitHub – Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [Bitbucket – Verify webhook signature](https://support.atlassian.com/bitbucket-cloud/kb/bitbucket-cloud-python-sample-code-to-verify-webhook-signature/), [HookSense – HMAC Best Practices 2026](https://hooksense.com/blog/webhook-security-hmac-best-practices)_

### Fallback: Polling

For providers where webhook registration is unavailable or blocked (generic git servers, firewalled self-hosted instances, users who decline webhook permissions):

- **Background polling worker** per connected repository: periodically runs `git fetch` and compares the new HEAD ref against the last known ref
- **Recommended interval**: 3–5 minutes as primary; degrade to 10 minutes if idle
- **ArgoCD pattern (industry reference)**: polls every 3 minutes by default; webhooks reduce detection to seconds; polling kept as safety net with 10-minute fallback even when webhooks are active
- **Missed webhook recovery**: webhooks are not guaranteed delivery. Keep polling active even for webhook-enabled repos at a longer interval (e.g., 10 minutes) to catch missed deliveries

_Source: [ArgoCD – Git Webhook Configuration](https://notes.kodekloud.com/docs/GitOps-with-ArgoCD/ArgoCD-Intermediate/Git-Webhook-Configuration/page), [ArgoCD Sync on Push](https://oneuptime.com/blog/post/2026-02-26-argocd-sync-on-push-not-polling/view)_

### Fallback: server-side post-receive hook (generic git)

For users with direct shell access to a bare git server, a `post-receive` hook can be injected:

```bash
#!/bin/sh
# hooks/post-receive
curl -s -X POST https://platform.example.com/webhooks/generic \
  -H "X-Repo-Token: {per-repo-secret}" \
  --data-binary @-
```

This is opt-in and requires the user to manually add the hook. The platform provides the script; the user installs it. This is the only option for truly bare git servers with no web UI.

_Source: [git-scm.com – githooks](https://git-scm.com/docs/githooks), [DigitalOcean – Git Hooks](https://www.digitalocean.com/community/tutorials/how-to-use-git-hooks-to-automate-development-and-deployment-tasks)_

---

## Architecture Recommendation

### Tier 1: GitHub App (First-Class, Reduced Onboarding Friction)

```
User onboarding flow (GitHub):
1. Click "Connect GitHub" → redirect to GitHub App installation UI
2. User selects which repos/orgs to share → GitHub redirects back with installation_id
3. Platform exchanges installation_id for installation access token (JWT → POST /app/installations/{id}/access_tokens)
4. Platform auto-registers push webhook via GitHub API
5. Token refreshed server-side every ~55 minutes (1h TTL)
```

**Why this wins for GitHub:**
- Single OAuth-like flow; user sees exactly which repos they're granting access to
- No token copy-paste; no repo URL entry
- Webhooks auto-registered; push events arrive within seconds
- Survives org admin departures (app install is org-level)
- Industry standard: how Vercel, Netlify, Railway, Linear, etc. integrate with GitHub

> **MVP note:** GitHub App is the post-MVP target. MVP uses a user-provided fine-grained PAT instead. See [MVP Scope](#mvp-scope) above.

### Tier 2: Universal (GitLab, Bitbucket, Azure DevOps, Gitea, Generic)

```
User onboarding flow (universal):
1. User selects provider type (GitLab / Bitbucket / Azure DevOps / Gitea / Other)
2. For OAuth-capable providers: redirect through provider's OAuth flow
   OR user pastes a PAT with the required scopes shown
3. User provides repository URL (clone URL)
4. Platform validates credential by attempting a git ls-remote
5. Platform attempts webhook registration via provider API (if token has API scope)
6. If webhook registration fails or is unavailable: fall back to polling
```

**Webhook registration attempt matrix:**

| Provider | Auto-register webhook? | Requirement |
|----------|----------------------|-------------|
| GitHub (App) | Yes, always | GitHub App installation |
| GitLab | Yes, if token has `api` scope | API scope on PAT/OAuth |
| Bitbucket Cloud | Yes, if OAuth token available | OAuth with webhook scope |
| Azure DevOps | Yes, via Service Hooks API | PAT with `Service Hooks (Read & Write)` |
| Gitea/Forgejo | Yes, via API | PAT with repo admin rights |
| Generic git | No — provide post-receive hook script to user | Manual user action |

### Credential Storage Schema (per user per repo)

```
table: repo_connections
- id
- user_id
- provider_type       (github_app | gitlab | bitbucket | azuredevops | gitea | generic_https | generic_ssh)
- repo_url            (clone URL, provider-normalized)
- encrypted_token     (AES-256-GCM, envelope-encrypted with per-tenant KMS key)
- token_type          (installation_token | oauth_access | pat | app_password | ssh_key_ref)
- token_expiry        (nullable; for OAuth/installation tokens)
- encrypted_refresh   (nullable; for OAuth providers with refresh tokens)
- webhook_id          (provider-side webhook ID, for cleanup on disconnect)
- webhook_secret      (HMAC secret; stored encrypted)
- polling_enabled     (boolean; true if webhook registration failed or not available)
- last_polled_at
- last_commit_sha
```

### Webhook Ingestion Architecture

```
POST /webhooks/{provider}/{connection_id}
  ↓
WebhookRouter
  ├── verify signature (HMAC-SHA256 timing-safe, or plain for GitLab)
  ├── parse push payload → extract branch, commit SHA, pusher
  └── emit internal PushEvent → queue/event bus
          ↓
    PushEventConsumer
      ├── look up repo_connection
      ├── run platform logic (trigger build, re-index, sync, etc.)
      └── update last_commit_sha
```

---

## Security Considerations

| Risk | Mitigation |
|------|-----------|
| Token exfiltration from DB | Envelope encryption (KMS + AES-256-GCM per record); Vault transit engine |
| Overly broad token scopes | Request minimal scopes; GitHub App fine-grained permissions; document required scopes per provider |
| Webhook spoofing | HMAC-SHA256 with timing-safe comparison; reject non-HTTPS webhook sources |
| Token rotation | GitHub App tokens auto-expire (1h); OAuth refresh tokens rotated on use; PATs require user action |
| SSH private key exposure | Never write to disk; pass as in-memory material to go-git; store in Vault |
| Replay attacks | Deduplicate on `X-GitHub-Delivery` header UUID; ignore payloads with identical delivery IDs within a time window |
| Polling rate limits | Respect provider rate limits; use `If-None-Match` / ETags where available; back off exponentially on 429 |

---

## ADR-002: GitHub Auth Token Ownership — Platform Entity vs. Per-User

> **Note:** This is an Architecture Decision Record (ADR) embedded in this research document for co-location convenience. It documents the platform-level decision on GitHub credential ownership.

**Date:** 2026-06-13
**Status:** Decided
**Deciders:** Marius (founder), Winston (architect)

### Context

bmad-easy connects multiple non-dev team members (PMs, BAs, Delivery Leads) to a shared GitHub repository. A Claude Agent SDK process running inside a Daytona sandbox clones the repo, writes BMAD artifacts, and pushes commits on each user's behalf. The platform must decide who owns the GitHub credential used for git transport: each individual platform user, or the platform acting as a single entity (GitHub App).

This decision is coupled with how commit authorship is expressed in git history and how access is revoked when a user leaves a team.

### Use Cases Evaluated

| # | Use Case |
|---|----------|
| UC1 | Non-dev without GitHub write access connects a team repo |
| UC2 | Committed artifacts identify the individual who created them |
| UC3 | Multiple teammates share one repo connection without individual OAuth flows |
| UC4 | User leaves team — their repo access stops |
| UC5 | Sandbox pre-warming fires at repo connect time, not at first message |
| UC6 | Webhooks registered once, survive user token expiry and departures |
| UC7 | Project Map reads repo state on every page load without an active user session |
| UC8 | Developer champion (repo admin) installs once; non-devs gain access without GitHub permissions |
| UC9 | Token scoped to minimum required permissions |
| UC10 | Org admin departure does not break the repo connection |

### Options Considered

**Option 1 — Per-User Tokens:** Each platform user authenticates with GitHub via OAuth. The platform stores their OAuth access token. All sandbox git operations use the acting user's token.

Outcome against use cases: UC1 ❌, UC3 ⚠️, UC4 ✅, UC5 ⚠️, UC6 ❌, UC7 ❌, UC8 ❌, UC10 ❌. Per-user tokens fail on the majority of load-bearing use cases. The core product premise — non-devs who lack GitHub repo access using the platform — is blocked at the auth layer.

**Option 2 — Single Entity (GitHub App):** One GitHub App registered for the platform. The developer champion installs it on their org/repo once. All sandbox git operations use installation access tokens (1-hour TTL, auto-refreshed by NestJS). The platform controls who can access which repos; GitHub is not the access control layer.

Outcome: UC1 ✅, UC3 ✅, UC4 ⚠️ (mitigated — see below), UC5 ✅, UC6 ✅, UC7 ✅, UC8 ✅, UC10 ✅.

**Option 3 — True Hybrid (GitHub App for transport + per-user OAuth for identity):** GitHub App handles all git operations; a separate per-user OAuth token is stored for identity verification and PR attribution via the GitHub API.

Outcome: Marginally better than Option 2 on PR attribution; not meaningfully better than Option 2 on any other use case. Adds a second credential flow and doubles token storage complexity. Not justified until PR attribution via the GitHub API is a product requirement.

### Decision: Option 2 — GitHub App (single entity)

> **MVP note:** This ADR documents the post-MVP target architecture. bmad-easy MVP uses fine-grained user-provided PATs rather than a GitHub App installation. See [MVP Scope](#mvp-scope). Implement GitHub App when beta feedback identifies PAT-generation friction as a material activation blocker.

The platform registers one GitHub App. The developer champion installs it once on their org or selected repositories. All git transport uses installation access tokens issued by the platform's NestJS backend.

**Auth token ownership and git author identity are independent.** The installation token used for `git push` does not determine what appears in `git log`. The NestJS backend injects per-user author metadata into every Daytona sandbox at creation time:

```
GIT_AUTHOR_NAME=<platform user display name>
GIT_AUTHOR_EMAIL=<platform user email>
GIT_COMMITTER_NAME=<platform user display name>
GIT_COMMITTER_EMAIL=<platform user email>
```

Git history correctly attributes each artifact to the individual who created it. GitHub displays the commit as authored by the user and pushed via the bmad-easy GitHub App — the same pattern used by Vercel, Netlify, Railway, and Linear.

**UC4 mitigation (user revocation):** Because GitHub is not the access control layer, revocation must be enforced at the platform layer. A user deactivated in bmad-easy immediately loses the ability to start new sessions. NestJS validates the user's platform session on every `POST /agent` request before issuing a sandbox. The GitHub App installation's continued existence is irrelevant once the platform rejects the user.

### Consequences

| Concern | Owner |
|---------|-------|
| Git transport credentials (clone/push) | GitHub App installation token — platform entity |
| Commit author identity | Per-user `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` injected as Daytona sandbox env vars |
| Access control: who can use which repo | Platform (bmad-easy) — per-seat, session-gated |
| Webhook registration | Automatic at GitHub App installation event — no user action required |
| Project Map background reads | GitHub App installation token — always available; no user session required |
| Token rotation | NestJS refreshes installation tokens every ~55 minutes (1-hour TTL) |
| Revocation when user leaves team | Platform deactivates user → `POST /agent` rejected → no new sessions |

### Explicitly Rejected

- **Per-user OAuth tokens** (Option 1): Recreates the developer-tooling barrier that bmad-easy exists to remove. Non-devs would need individual GitHub repo write access, adding an out-of-platform prerequisite. Webhook and Project Map stability tied to individual user tokens. Fails 5 of 10 use cases.
- **True hybrid** (Option 3): Per-user OAuth adds a second credential flow without improving any use case outcome that git author metadata does not already cover. Revisit only if PR attribution via the GitHub API (creating PRs as the individual user's GitHub identity) becomes a product requirement.

### Future Trigger for Revisiting

If bmad-easy needs to create GitHub Pull Requests attributed to the individual user's GitHub account (rather than the GitHub App), per-user OAuth becomes justified. At that point, implement Option 3: GitHub App for git transport, per-user OAuth stored separately for GitHub API calls only.

---

## Summary and Decisions

| Decision | Recommendation |
|----------|---------------|
| GitHub integration model | **GitHub App** — fine-grained, installation-scoped, auto-webhook, 1h tokens |
| Universal auth method | **HTTPS + PAT** as primary; SSH key pair as alternative for users who prefer it |
| Git client library | **go-git** (if backend is Go) — pure Go, SSH/HTTPS auth via callbacks |
| Credential storage | **Encrypted DB columns** (AES-256-GCM, KMS envelope) for tokens; **Vault** for SSH private keys |
| Webhook default | **Auto-register via provider API** where token scope allows; platform handles the setup |
| Webhook security | **HMAC-SHA256** with timing-safe comparison; per-connection secret; UUID deduplication |
| Fallback for no-webhook | **Polling every 3–5 minutes** as primary; 10-minute safety-net polling even when webhooks active |
| Bare git servers | Provide **post-receive hook script** for user to install manually |

---

## Gaps and Open Questions

*Identified via pre-mortem analysis — areas the architecture must address before production.*

---

### 1. Credential Health Monitoring (Missing Feature — High)

The report has no detection-and-notification loop for expired or revoked credentials. GitLab enforces a 1-year maximum PAT expiry; Bitbucket app passwords can be revoked by users at any time. Without active health checks, failures are silent: polling workers hit 401s indefinitely and users discover broken connections only when they notice missing commits.

**Required addition:** A background credential-validation job that periodically calls a lightweight provider API endpoint (e.g., `GET /user` or `git ls-remote`) with the stored credential, sets an `auth_health_status` field in `repo_connections`, and triggers a user-facing re-auth notification on failure. The DB schema needs `last_auth_error`, `auth_health_status`, and `auth_failed_at` columns.

---

### 2. GitHub App Installation Is a Hard Prerequisite for Non-Dev Teams (Hidden Assumption — High)

The report presents GitHub App as satisfying UC1 (non-dev without GitHub write access), but GitHub App installation requires organization **owner** permissions. Teams with no developer champion hit a wall at onboarding — they cannot install the app themselves.

**Required addition:** Document this as an explicit prerequisite in the onboarding flow. Provide a PAT-based fallback path for GitHub (same as Tier 2 universal flow) for teams with no org admin available. Surface this in the UX as a branching choice: "Install GitHub App (recommended)" vs "Use a Personal Access Token."

---

### 3. go-git Has Material Limitations for Production Use (Incomplete Recommendation — High)

go-git lacks native Git LFS support (LFS pointer files are cloned as raw text), can OOM on large repos (>1 GB) due to in-memory object graph loading, and has SSH compatibility issues with some enterprise key-exchange configurations. Document these constraints at connect time and provide a `git` CLI subprocess fallback for affected cases.

---

### 4. Azure DevOps Webhook Security Is Insufficient for Enterprise (Weak Mitigation — Medium)

UUID-based webhook URLs (security through obscurity) are not an acceptable mitigation for enterprise customers. UUIDs can appear in server logs, error messages, and browser history.

**Required addition:** Either implement IP allowlisting against Microsoft's published Azure DevOps CIDR ranges (with an operational process to track range updates) or formally classify Azure DevOps as webhook-unsupported and default to polling with an explicit UX explanation. Remove the UUID-URL mitigation from the security table.

---

### 5. No Webhook Secret Rotation Procedure (Missing Operational Guidance — Medium)

The report stores webhook secrets encrypted but defines no rotation procedure. If secrets are compromised, the platform must atomically: generate a new secret, call each provider's API to update the webhook config, and update the DB record. For a large number of connections across multiple providers, this is a multi-step operation with no documented rollback.

**Required addition:** Design a dual-secret transition window (accept both old and new HMAC secrets for a short overlap period during rotation, mirroring GitHub's own approach). Document the rotation runbook as an operational requirement.

---

### 6. Cross-Tenant GitHub App Token Scoping Is Unspecified (Security Gap — High)

The report states "the platform controls who can access which repos" but does not specify the enforcement mechanism. A code bug that retrieves the wrong `installation_id` from the database could result in an installation token for one customer's org being used to access another customer's repository.

**Required addition:** Every code path from `connection_id` to installation token issuance must pass through a tenant authorization check that verifies `repo_connection.tenant_id == requesting_tenant_id` before calling `POST /app/installations/{id}/access_tokens`. This must be enforced at the service layer, not assumed at the caller layer.

---

### 7. UC4 Revocation Is Passive, Not Active (ADR Gap — Medium)

The ADR acknowledges UC4 as ⚠️ with the mitigation "platform deactivates user → `POST /agent` rejected → no new sessions." This is passive: an in-progress agent session at deactivation time continues running in its Daytona sandbox, potentially committing to the repository for the remainder of the session (up to the session timeout).

**Required addition:** User deactivation must emit an event that actively terminates all running sandboxes for that user (e.g., `DELETE /sandbox/{id}` on Daytona). The ADR consequences table should reflect this as a required platform behaviour, not a future consideration.

---

### 8. Forgejo API Compatibility Claim Is Under-Sourced (Source Quality — Low)

The Forgejo API compatibility claim cites TechVerdict (non-authoritative). Source from the [official Forgejo API docs](https://codeberg.org/forgejo/forgejo/src/branch/forgejo/docs) or changelog before implementing. Flag Forgejo API divergence from Gitea as an ongoing maintenance risk.

---

### 9. No GitHub PAT Fallback for GitHub Onboarding (Missing Alternative — Medium)

The report presents GitHub App as the only GitHub integration path. There is no fallback for users whose GitHub org disables third-party app installations (a setting available to org admins).

**Required addition:** Document and implement a PAT-based GitHub path (identical to the Tier 2 universal flow) as a fallback. Surface it in onboarding if GitHub App installation fails or is declined.

---

### 10. Webhook Payload Normalization Layer Not Designed (Missing Architecture Component — Medium)

Push event payloads differ significantly across providers (field names, nesting, branch ref format). The `WebhookRouter` emits a `PushEvent` but the normalization from provider-specific payload to an internal `NormalizedPushEvent` schema (branch, HEAD SHA, changed files, pusher identity) is not yet designed. Add per-provider adapter logic between `WebhookRouter` and the internal event bus.

---
