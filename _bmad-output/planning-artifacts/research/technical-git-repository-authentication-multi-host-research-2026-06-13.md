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

# Research Report: Git Repository Authentication for Multi-Host Platforms

**Date:** 2026-06-13
**Author:** Marius
**Research Type:** Technical

---

## Technical Research Scope Confirmation

**Research Topic:** Git Repository Authentication for Multi-Host Platforms
**Research Goals:** Evaluate platform-agnostic git authentication approaches (SSH keys, PATs, credential helpers); assess multi-faceted strategy with GitHub-first onboarding (OAuth App / GitHub App) plus universal git support for GitLab, Bitbucket, Gitea, self-hosted, etc.; cover push notification / webhook strategies including fallbacks for self-hosted git.

**Technical Research Scope:**

- Architecture Analysis — how git authentication flows work across providers; OAuth vs SSH vs token models
- Implementation Approaches — GitHub App vs OAuth App; credential helper patterns; per-user credential storage
- Technology Stack — libraries and protocols: libgit2/go-git/JGit, HTTPS credential helpers, SSH agent forwarding
- Integration Patterns — unified credential abstraction layer; provider-specific adapters
- Push Notification / Webhooks — provider webhook APIs (GitHub, GitLab, Bitbucket, Azure DevOps); fallback strategies for self-hosted git (Gitea/Forgejo webhooks, polling, server-side hooks); webhook verification and security (HMAC signatures)
- Performance & Security Considerations — token scopes, secret storage, rotation, revocation

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-06-13

---

## Research Overview

This report evaluates authentication strategies for a platform that connects to user-owned git repositories hosted across multiple providers (GitHub, GitLab, Bitbucket, Azure DevOps, Gitea/Forgejo, and generic self-hosted git). It also covers push-notification strategies so the platform can react when users push to their source-of-truth repositories.

The research recommends a **two-tier approach**: a first-class GitHub App integration that dramatically reduces onboarding friction for GitHub users, combined with a universal credential layer (HTTPS Personal Access Token or SSH key) that works for every other provider. Webhook registration is automated where the provider API allows it, with polling as a universal fallback.

All claims are sourced from official provider documentation and current technical literature (2024–2026).

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

## Sources

- [GitHub Docs – Differences between GitHub Apps and OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [GitHub Docs – Authenticating as a GitHub App installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
- [Nango Blog – GitHub App vs GitHub OAuth](https://nango.dev/blog/github-app-vs-github-oauth/)
- [HashiCorp – GitHub App vs OAuth for Terraform integration](https://www.hashicorp.com/en/blog/github-app-vs-oauth-for-terraform-integration)
- [GitHub Blog – Git Credential Manager: authentication for everyone](https://github.blog/security/application-security/git-credential-manager-authentication-for-everyone/)
- [git-ecosystem/git-credential-manager (GitHub)](https://github.com/git-ecosystem/git-credential-manager)
- [go-git Go Packages](https://pkg.go.dev/github.com/go-git/go-git/v5)
- [libgit2 – Authenticating against a server](https://libgit2.org/docs/guides/authentication/)
- [GitLab Docs – OAuth 2.0 identity provider API](https://docs.gitlab.com/api/oauth2/)
- [GitLab Docs – Token overview](https://docs.gitlab.com/security/tokens/)
- [GitLab Docs – Personal access tokens](https://docs.gitlab.com/user/profile/personal_access_tokens/)
- [Hookdeck – Guide to GitLab Webhooks](https://hookdeck.com/webhooks/platforms/guide-to-gitlab-webhooks-features-and-best-practices)
- [Databricks – Get access tokens from git providers](https://docs.databricks.com/aws/en/repos/get-access-tokens-from-git-provider)
- [Microsoft Learn – Authenticate with Azure DevOps git repos](https://learn.microsoft.com/en-us/azure/devops/repos/git/auth-overview?view=azure-devops)
- [Microsoft Learn – Azure DevOps PATs](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops)
- [Microsoft Learn – Service Hooks REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/hooks/?view=azure-devops-rest-7.1)
- [Microsoft Learn – Azure DevOps Webhooks](https://learn.microsoft.com/en-us/azure/devops/service-hooks/services/webhooks?view=azure-devops)
- [Atlassian – Verify Bitbucket webhook signature (Python)](https://support.atlassian.com/bitbucket-cloud/kb/bitbucket-cloud-python-sample-code-to-verify-webhook-signature/)
- [Hookdeck – How to Secure and Verify Bitbucket Webhooks](https://hookdeck.com/webhooks/platforms/how-to-secure-and-verify-bitbucket-webhooks-with-hookdeck)
- [GitHub Docs – Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [HookSense – Webhook Security: HMAC Verification Guide 2026](https://hooksense.com/blog/webhook-security-hmac-best-practices)
- [n8n – Webhook and Gitea integration](https://n8n.io/integrations/webhook/and/gitea/)
- [TechVerdict – Self-Hosted Git in 2026](https://www.techverdict.io/articles/self-hosted-git-2026)
- [KodeKloud – ArgoCD Git Webhook Configuration](https://notes.kodekloud.com/docs/GitOps-with-ArgoCD/ArgoCD-Intermediate/Git-Webhook-Configuration/page)
- [OneUptime – How to Configure ArgoCD to Sync on Push](https://oneuptime.com/blog/post/2026-02-26-argocd-sync-on-push-not-polling/view)
- [git-scm.com – githooks documentation](https://git-scm.com/docs/githooks)
- [DigitalOcean – How to Use Git Hooks to Automate Deployment Tasks](https://www.digitalocean.com/community/tutorials/how-to-use-git-hooks-to-automate-development-and-deployment-tasks)
- [HCP Vault Secrets](https://developer.hashicorp.com/hcp/docs/vault-secrets)
- [AWS Blog – SaaS Data Isolation with HashiCorp Vault in EKS](https://aws.amazon.com/blogs/apn/saas-data-isolation-with-dynamic-credentials-using-hashicorp-vault-in-amazon-eks/)
