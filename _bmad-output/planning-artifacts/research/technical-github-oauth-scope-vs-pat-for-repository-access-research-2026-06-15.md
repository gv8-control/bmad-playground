---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'GitHub OAuth scope vs PAT for repository access'
research_goals: 'Determine whether GitHub sign-in (OAuth) provides sufficient read/write access to user repositories, or whether a PAT needs to be requested during onboarding'
user_name: 'Marius'
date: '2026-06-15'
web_research_enabled: true
source_verification: true
---

# GitHub Repository Access for bmad-easy: OAuth, GitHub Apps, and PATs

**Date:** 2026-06-15
**Author:** Marius
**Research Type:** Technical

---

## Research Overview

This research answers a concrete architectural question for the bmad-easy PRD: does GitHub sign-in (OAuth) give the platform sufficient read/write access to a user's repository, or must onboarding request a Personal Access Token (PAT)?

The short answer is that **GitHub sign-in alone does not grant usable repository access by default** — the scopes requested during the OAuth flow determine what access is obtained, and the choice of integration model (OAuth App vs GitHub App) fundamentally changes the security posture, UX, and what the platform can do. The PRD's current PAT approach (UJ-1) works but is the weakest option on both security and UX grounds. The industry-standard alternative — a registered GitHub App — eliminates the PAT entirely and fits the bmad-easy team dynamics far better.

The full analysis covers the three available integration patterns, how each token type works for git HTTP operations, what GitHub recommends, what comparable platforms (Vercel, Netlify) actually do, and a concrete recommendation for bmad-easy including how the developer-champion role maps onto the GitHub App installation model.

---

## Technical Research Scope Confirmation

**Research Topic:** GitHub OAuth scope vs PAT for repository access
**Research Goals:** Determine whether GitHub sign-in (OAuth) provides sufficient read/write access to user repositories, or whether a PAT needs to be requested during onboarding

**Technical Research Scope:**

- Architecture Analysis — GitHub's OAuth App model, GitHub App model, token types, authorization flows
- Implementation Approaches — How OAuth tokens are obtained, what scopes cover repository access, how PATs differ
- Technology Stack — GitHub REST API, GitHub Apps, OAuth 2.0, repository permission models
- Integration Patterns — How platforms (Vercel, Netlify) handle this; what GitHub officially recommends
- Security & UX Considerations — Fine-grained vs classic PATs, OAuth scope granularity, installation friction, org admin requirements

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence levels applied where sources conflict or information is incomplete

**Scope Confirmed:** 2026-06-15

---

## Technology Stack Analysis

### GitHub's Three Integration Models

GitHub offers three distinct patterns for third-party platforms that need repository access. Understanding the boundaries of each is the prerequisite for answering the research question.

**OAuth Apps**
OAuth Apps use the standard OAuth 2.0 web flow. The platform registers an OAuth App in GitHub, defines which scopes it needs, and users authorize the app. Scopes are coarse-grained. The `repo` scope — the one needed for read/write repository access — grants full control over all public, internal, and private repositories the authorizing user can access. There is no read-only repo scope; `public_repo` covers only public repos. OAuth tokens do not expire until revoked by the user.

*Source: [Scopes for OAuth Apps — GitHub Docs](https://docs.github.com/enterprise-server@3.0/developers/apps/building-oauth-apps/scopes-for-oauth-apps)*

**GitHub Apps**
GitHub Apps are registered entities on GitHub's platform. They use fine-grained repository permissions rather than scopes. A GitHub App requests exactly the permissions it needs (e.g., "Contents: read & write") and users choose which specific repositories the app can access during installation. GitHub Apps generate two types of tokens: installation access tokens (used by the app acting as itself, expiring after 1 hour) and user access tokens (used when acting on behalf of a specific user, also short-lived). Both token types can be used for git HTTP operations.

*Source: [Differences between GitHub Apps and OAuth Apps — GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)*

**Personal Access Tokens (PATs)**
PATs are user-created credentials generated manually in GitHub account settings. Classic PATs use broad scopes (same model as OAuth Apps). Fine-grained PATs (introduced 2022, now stable) support repo-level permission scoping and mandatory expiration. PATs are tied to individual users and can be used directly as git HTTP credentials.

*Source: [Managing personal access tokens — GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)*

### Token Authentication for Git HTTP Operations

All three token types can authenticate git HTTP operations (clone, push, pull). The mechanism is identical: the token is used as the HTTP password (or as `x-access-token` in the URL) with the HTTPS remote URL. GitHub deprecated password authentication for git on August 13, 2021.

| Token type | Git HTTP usage | Expires |
|---|---|---|
| OAuth App token (`gho_`) | `https://oauth_token@github.com/owner/repo.git` | No (until revoked) |
| GitHub App installation token | `https://x-access-token:TOKEN@github.com/owner/repo.git` | 1 hour |
| GitHub App user access token (`ghu_`) | `https://x-access-token:TOKEN@github.com/owner/repo.git` | Short-lived |
| Classic PAT | `https://TOKEN@github.com/owner/repo.git` | No (unless configured) |
| Fine-grained PAT | `https://TOKEN@github.com/owner/repo.git` | Mandatory expiration |

The token determines **what** can be accessed; the git credentials layer handles **how** to authenticate. This means the core research question is about scope and architecture, not about whether git operations are technically possible.

*Source: [Easier builds and deployments using Git over HTTPS and OAuth — GitHub Blog](https://github.blog/news-insights/easier-builds-and-deployments-using-git-over-https-and-oauth/)*
*Source: [Token authentication requirements for Git operations — GitHub Blog](https://github.blog/security/application-security/token-authentication-requirements-for-git-operations/)*

---

## Integration Patterns Analysis

### Pattern 1: OAuth App with `repo` scope (single-step, all repos)

The platform registers an OAuth App and requests the `repo` scope during sign-in. The user authorizes once. The returned OAuth token can be used to read and write all repositories the user can access, including for git HTTP operations.

**What this gives the platform:**
- User identity (via the `user` scope, typically requested alongside `repo`)
- Read/write access to all repositories the user can access
- Single authorization flow — user does nothing except click "Authorize"

**What this does not give:**
- Granular control — the token covers all repos, not just the one the user wants to connect
- Fine-grained permissions — it's read AND write, not read-only
- Organization-level safety — if the org has OAuth App restrictions enabled, non-owner members' tokens will not have write access to org repos even with `repo` scope

**Confidence: High** — This is documented GitHub behavior.

*Source: [Read-Only OAuth Scope — GitHub Community Discussion #7891](https://github.com/orgs/community/discussions/7891)*
*Source: [Shortcomings of GitHub OAuth for Multiple Scope Permission Levels — Medium](https://medium.com/@wkoffel/shortcomings-of-github-oauth-for-multiple-scope-permission-levels-d4e959d2c6fe)*

### Pattern 2: OAuth sign-in (identity only) + manual PAT (current PRD approach)

The platform uses OAuth for identity only (scopes like `user:email`, `read:user`) and separately requests a PAT from the user during onboarding. The PAT is stored by the platform and used for git operations. This is what UJ-1 currently describes.

**What this gives the platform:**
- Clean separation of concerns: OAuth for identity, PAT for repository access
- User-specified scope: they can create a fine-grained PAT with access only to the one repo
- Works regardless of org OAuth App restrictions (PATs are not subject to org OAuth policies in the same way)

**What this does not give:**
- Smooth onboarding — the user must navigate GitHub account settings, understand PAT scope selection, set an expiry, and copy the token without losing it
- Security by default — platforms typically store the PAT (long-lived credential) encrypted at rest; any platform breach exposes tokens that don't expire
- Non-dev accessibility — PMs and BAs are likely unfamiliar with PAT creation; this is the most technically demanding step in the onboarding flow

**Key UX issue:** For the primary bmad-easy user (a PM or BA, not a developer), the manual PAT creation step is a significant barrier. GitHub's UI for PAT creation requires navigating to Settings > Developer settings > Personal access tokens > Fine-grained tokens, setting expiry, selecting the repository, choosing permissions — a sequence that is well-understood by developers but opaque to non-developers.

*Source: [Introducing fine-grained personal access tokens — GitHub Blog](https://github.blog/security/application-security/introducing-fine-grained-personal-access-tokens-for-github/)*

### Pattern 3: GitHub App (install on specific repos + OAuth sign-in)

The platform registers as a GitHub App with "Contents: read & write" repository permission. During onboarding, the user installs the GitHub App by navigating to GitHub's installation page (linked from the platform). The installation UI lets the user choose exactly which repositories the app can access — individual repos or all repos. After installation, the platform uses installation access tokens for git operations and user access tokens for identity.

**What this gives the platform:**
- Repo-specific access — user selects exactly which repositories the app can access
- Fine-grained permissions — platform requests only what it needs (read/write on contents)
- Short-lived tokens — installation tokens expire in 1 hour; platform refreshes them programmatically
- No PAT management — the user never creates or manages a token
- Commit attribution — commits can show the user as author in git metadata while using the installation token for authentication
- Industry alignment — this is the same pattern Vercel, Netlify, and Linear use

**What this requires:**
- The platform must be built as a GitHub App (more upfront implementation work)
- The user installing the app on an **organization** repository may need org admin rights (depending on org policy)
- Two GitHub pages in the onboarding flow (installation page + OAuth authorization) — though GitHub can chain these

**Installation admin requirement detail:** For **personal account repositories**, any user can install a GitHub App. For **organization repositories**, organization owners can install the app by default. Repository admins within the org can also install GitHub Apps unless the org owner has blocked this (a setting available since December 2025). This is important for the bmad-easy target context.

*Source: [Installing a GitHub App from a third party — GitHub Docs](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party)*
*Source: [Block repository administrators from installing GitHub Apps — GitHub Changelog](https://github.blog/changelog/2025-12-01-block-repository-admins-from-installing-github-apps-now-generally-available/)*
*Source: [Repository permissions and linking — Netlify Docs](https://docs.netlify.com/build/git-workflows/repo-permissions-linking/)*

### Integration Security Patterns

| Dimension | OAuth App + `repo` | OAuth + PAT | GitHub App |
|---|---|---|---|
| Credential stored by platform | Long-lived OAuth token | Long-lived PAT | No long-lived credential (tokens refreshed hourly) |
| Scope | All user repos | Configurable (fine-grained PAT: single repo) | Exactly selected repos |
| Org policy risk | High (OAuth restrictions) | Low | Low (installation-level, not token-level) |
| User must take action | None (sign-in only) | Create PAT in GitHub UI | Install GitHub App (guided flow) |
| GitHub recommendation | Not preferred | Acceptable for users/scripts | **Preferred for platforms** |

---

## Architectural Patterns and Design

### How Comparable Platforms Handle This

**Netlify:** Migrated from OAuth App to GitHub App model. The GitHub App offers scoped repository access, allowing the user to choose specific repositories. Installation-level tokens replace personal tokens, meaning Netlify's access does not break when a user's personal token changes or expires. Netlify explicitly documents that the OAuth connection method silently loses access when tokens are rotated.

*Source: [Repository permissions and linking — Netlify Docs](https://docs.netlify.com/build/git-workflows/repo-permissions-linking/)*
*Source: [Netlify GitHub Integration — Kuberns](https://kuberns.com/blogs/netlify-github-integration/)*

**Vercel:** Uses GitHub App integration. During project setup, the user installs the Vercel GitHub App and selects which repositories are accessible. No PAT is ever requested.

*Source: [Using private GitHub repositories with Vercel Sandbox — Vercel Knowledge Base](https://vercel.com/kb/guide/sandbox-private-github-repositories)*

**Hashicorp Terraform Cloud:** Migrated from OAuth to GitHub App. Explicitly documented that the GitHub App approach provides better security because installation tokens are short-lived and repo-scoped, whereas OAuth tokens were broad and long-lived.

*Source: [GitHub App vs. OAuth for Terraform integration — Hashicorp Blog](https://www.hashicorp.com/en/blog/github-app-vs-oauth-for-terraform-integration)*

### GitHub App Two-Token Architecture

A properly implemented GitHub App uses both token types together:

```
User → bmad-easy platform
  ↓ (sign-in via GitHub App OAuth)
User access token (ghu_...) → identifies the user, respects user's repo permissions
Installation access token (auto-refreshed hourly) → used for git push/pull on installed repos
```

The installation token is what the platform uses for git operations. The user access token is what identifies who is making the request. Commits can include the user's name and email in the git commit author fields, even though the HTTP authentication uses the installation token.

This architecture means:
- The platform does not need to store any long-lived user credential
- Repository access survives user token rotation
- Access is precisely scoped to the repositories selected during installation

### System Design for bmad-easy

The bmad-easy platform has a specific structural advantage for the GitHub App model: the **developer champion**. The PRD already defines this role as the developer who initialised BMAD in the repository. This developer is almost certainly the repository admin (or has admin rights). The natural extension of their BMAD setup step is to also install the bmad-easy GitHub App on the repository.

This means:
1. Developer installs bmad-easy GitHub App on the team's BMAD repo (once, during setup)
2. Developer invites Sarah (PM) to bmad-easy
3. Sarah signs in with GitHub OAuth — this is the GitHub App's user authorization flow
4. Platform uses the existing installation (from step 1) to access the repo
5. Sarah commits artifacts using installation tokens; git author metadata shows Sarah's name

The non-dev user (Sarah) never sees or interacts with PAT creation. The admin step (app installation) is done by the person who is already doing admin work (BMAD setup).

This aligns directly with the PRD's existing developer-champion model and removes the PAT from the non-dev onboarding flow entirely.

*Source: [Deciding when to build a GitHub App — GitHub Docs](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app)*
*Source: [Integrating with GitHub — GitHub Apps and OAuth — Northflank Blog](https://northflank.com/blog/integrating-with-github-github-apps-and-oauth)*

---

## Implementation Approaches and Technology Adoption

### GitHub App Implementation Requirements

Building a GitHub App requires more platform-side implementation than OAuth Apps or PAT storage, but the pieces are well-documented:

**Registration:** The platform registers a GitHub App in GitHub Developer Settings. This is a one-time platform-level action (not per-user). The app specifies: required permissions (`Contents: read & write`), callback URL for OAuth, webhook URL (optional), and whether it can be installed by anyone.

**Installation flow:** The platform links users to `https://github.com/apps/<app-slug>/installations/new`. GitHub shows the installation UI where the user selects repositories. After installation, GitHub calls the platform's callback URL with an installation ID.

**Token generation:** The platform authenticates as the GitHub App using a private key (RS256 JWT) to call GitHub's API and exchange the installation ID for an installation access token. This token expires in 1 hour and must be refreshed programmatically. Robust libraries exist for this in all major languages (Octokit for Node.js/TypeScript, PyGitHub for Python, etc.).

**User identity:** If the GitHub App also requests user authorization (OAuth during install), GitHub provides a user access token after installation. This gives the platform the user's identity without a separate OAuth App.

**Development complexity vs PAT:** The PAT approach requires only storing a string and using it as a git credential. The GitHub App approach requires: JWT signing, installation token exchange, token refresh logic, and webhook handling (optional). This is meaningfully more complex but is well-covered by GitHub's SDKs and is standard practice in the industry.

*Source: [Authenticating as a GitHub App installation — GitHub Docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)*
*Source: [Generating a user access token for a GitHub App — GitHub Docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)*

### PAT Approach Implementation Requirements

Simpler to implement:
1. After OAuth sign-in, show an input field for a PAT
2. Validate the PAT against the GitHub API (verify it has access to the specified repository)
3. Store the PAT encrypted at rest
4. Use the PAT as the HTTP credential for git clone/push/pull

The PRD's current UJ-1 describes this approach, including a link to GitHub documentation for token generation and a validation step before proceeding to the Project Map.

**Risk:** PATs stored by the platform are long-lived credentials. A platform security breach exposes credentials that do not expire (classic PATs) or expire far in the future (fine-grained PATs with long expiry). This is a liability the platform carries indefinitely.

### Technology Adoption Strategies

GitHub is actively moving the ecosystem toward GitHub Apps:
- Fine-grained PATs (launched 2022) are explicitly recommended over classic PATs
- GitHub Apps are explicitly described as preferred over OAuth Apps in all current documentation
- Netlify, Vercel, Terraform Cloud, Linear, and most CI/CD platforms have migrated from OAuth/PAT to GitHub App models

For a new platform starting development in 2026, building the PAT approach and planning to migrate to GitHub Apps later creates two onboarding flows to maintain and a migration story for existing users. Building the GitHub App model from the start avoids this.

*Source: [GitHub App vs. GitHub OAuth: When to Use Which — Nango Blog](https://nango.dev/blog/github-app-vs-github-oauth/)*
*Source: [Replacing a GitHub Personal Access Token with a GitHub Application — Aembit Blog](https://aembit.io/blog/replacing-a-github-personal-access-token-with-a-github-application/)*

---

# Comprehensive Research Synthesis

## Executive Summary

GitHub sign-in (OAuth) alone does not provide repository access — the scopes or installation permissions requested determine what the platform can do with a repository. There are three patterns available, and they are not equivalent.

The current PRD (UJ-1) describes the PAT pattern: OAuth sign-in for identity, then a manual PAT entry step. This works technically but is the worst option for the target user (non-developer PMs and BAs) and the weakest option on security. The `repo` scope added to OAuth sign-in eliminates the PAT step but introduces over-broad access. The GitHub App pattern eliminates the PAT entirely, gives fine-grained repo-specific access, uses short-lived tokens, and is what every major comparable platform uses.

**The recommended path for bmad-easy is the GitHub App model**, with the developer champion performing the one-time GitHub App installation on the team's BMAD repository. Non-dev users (Sarah the PM) then sign in with GitHub and gain access through the app's installation — with no PAT creation required.

**Key Technical Findings:**

- OAuth sign-in with `repo` scope CAN provide read/write git access, but grants over-broad access (all user repos) and is not GitHub's recommended approach for new integrations
- GitHub App installation tokens work for git HTTPS operations (`x-access-token:<token>`) with "Contents: read & write" permission
- The PAT approach is technically correct but creates meaningful onboarding friction for non-developers and stores long-lived credentials at the platform
- GitHub Apps are the explicit GitHub recommendation for third-party platforms; Netlify, Vercel, and Terraform Cloud have all migrated to this model
- The bmad-easy developer-champion role maps naturally onto the GitHub App installation step, eliminating any admin-rights complication for non-dev users

**Technical Recommendations:**

1. Register bmad-easy as a GitHub App with "Contents: read & write" repository permission
2. Include the GitHub App installation step in the developer's BMAD setup documentation, not in the non-dev user onboarding
3. Non-dev users sign in via the GitHub App's user authorization (OAuth) flow — this is the only GitHub interaction they need
4. Remove the PAT collection step from UJ-1; replace with "your developer connects the repository" or prompt the user to install the app if not already installed
5. Implement installation token refresh logic (hourly expiry); use an Octokit or equivalent SDK to reduce implementation complexity

---

## Table of Contents

1. Technical Research Introduction and Methodology
2. GitHub Repository Access Technical Landscape
3. Implementation Approaches and Best Practices
4. Technology Stack and Token Architecture
5. Integration and Interoperability Patterns
6. Security and Compliance Considerations
7. Strategic Technical Recommendations
8. Implementation Roadmap and Risk Assessment
9. Future Technical Outlook
10. Technical Research Methodology and Source Verification
11. Technical Appendices and Reference Materials

---

## 1. Technical Research Introduction and Methodology

### Research Significance

The choice of GitHub integration pattern is one of the most consequential early architecture decisions for bmad-easy. It determines the onboarding experience for the platform's primary users (non-developers), the security posture of the platform (how long-lived credentials are stored), the risk surface in case of org policy changes, and the development complexity at build time. Getting this right at the PRD stage avoids a costly migration later.

The platform's target users are explicitly non-technical — PMs, BAs, delivery leads. The current PRD (UJ-1) has Sarah the PM pasting a PAT she generated from GitHub Developer Settings. For a developer this is routine; for a non-developer this is a significant friction point that may cause onboarding abandonment.

### Research Methodology

- Current web data with rigorous source verification
- Primary sources: GitHub's official documentation, GitHub engineering blog, GitHub Changelog
- Secondary sources: Engineering blogs from Netlify, Vercel, Hashicorp, Northflank, Nango, Aembit
- Confidence levels: High (directly from GitHub docs), Medium (from third-party engineering posts), Low (inferred from patterns)
- Focus: current state as of 2025–2026; GitHub's token architecture has been stable since the 2022 fine-grained PAT launch

### Research Goals and Objectives

**Original Goal:** Determine whether GitHub sign-in (OAuth) provides sufficient read/write access to user repositories, or whether a PAT needs to be requested during onboarding.

**Achieved Objectives:**

- Confirmed that OAuth sign-in scope determines what repository access is granted — it is not automatic
- Mapped all three integration patterns (OAuth App, GitHub App, PAT) against the bmad-easy use case
- Identified the GitHub App pattern as the preferred approach and mapped it to the existing PRD's developer-champion model
- Identified the specific implementation requirements for the GitHub App approach
- Verified that all token types work for git HTTPS operations

---

## 2. GitHub Repository Access Technical Landscape

### Current Architecture: Three Patterns, Three Tradeoffs

GitHub's access model for third-party platforms has evolved significantly. The platform currently supports three meaningful integration patterns, each with different characteristics for the bmad-easy use case.

**OAuth App pattern:** Simple to implement, single authorization flow, but uses coarse-grained scopes. The `repo` scope needed for read/write access grants full control over all user repos — a privilege far wider than needed. Tokens are long-lived. Organization admins can block OAuth App access to org repos, which would break any user who is a member of a repo within an org that has OAuth App restrictions.

_Dominant pattern in: legacy CI/CD tools, early GitHub integrations (pre-2020)_
_Source: [Differences between GitHub Apps and OAuth Apps — GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)_

**GitHub App pattern:** More complex to implement, two GitHub pages in the flow (installation + authorization), but uses fine-grained permissions and short-lived tokens. The user selects specific repositories. The platform's access is installation-scoped, not user-scoped. GitHub explicitly recommends this pattern for all new integrations.

_Dominant pattern in: Vercel, Netlify, Terraform Cloud, Linear, GitHub Actions_
_Source: [Deciding when to build a GitHub App — GitHub Docs](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app)_

**PAT pattern:** Lowest implementation cost, but highest user burden and highest platform security risk. The platform stores a long-lived credential it does not control. The user must manually create the token, understand permission scopes, and paste it correctly. Non-developer users find this confusing.

_Appropriate for: developer-oriented tools, scripts, CI pipelines — not for non-developer end-users_
_Source: [Managing personal access tokens — GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)_

### System Design Principles

**Least privilege:** Only the GitHub App pattern provides genuine least-privilege access — the token covers only the repos selected during installation, with only the permissions the app declared.

**Short-lived credentials:** Only the GitHub App pattern avoids storing long-lived credentials. Installation tokens expire every hour. The refresh loop is programmatic — the user is never involved.

**User-decoupled access:** GitHub App installation is scoped to a repository, not to a user. When a team member leaves, the platform's access to the repo is not affected. With PATs, if Sarah's PAT is revoked or expires, the platform loses access.

---

## 3. Implementation Approaches and Best Practices

### Current Implementation Methodologies

**GitHub App registration (platform-level, one-time):**
- Register the app in GitHub Developer Settings under the bmad-easy account
- Set: permissions (Contents: read & write), callback URL, optional webhook URL
- Make the app public so any GitHub user can install it

**Developer onboarding step (per-team, one-time):**
- Developer follows the BMAD setup guide
- Step added: "Install the bmad-easy GitHub App on this repository"
- Link goes to `https://github.com/apps/bmad-easy/installations/new`
- GitHub shows the repo selection screen; developer selects the BMAD repository
- GitHub redirects back to the platform with an installation ID

**End-user sign-in (per-user, recurring):**
- User clicks "Sign in with GitHub" on bmad-easy
- GitHub shows the authorization screen (GitHub App's OAuth flow)
- User authorizes; platform receives user identity and a user access token
- Platform looks up which installations exist for repos the user has access to
- If installation exists for the connected repo, platform proceeds; otherwise shows "ask your developer to connect this repo"

**Git operations (programmatic, per-commit):**
- Platform generates an installation access token by authenticating as the GitHub App via JWT
- Token used as `x-access-token` for HTTPS git push/pull
- Token refreshed before each operation (or cached for up to 1 hour)
- Commit author fields set to the signed-in user's name and GitHub email

### Implementation Framework

| Component | Technology options |
|---|---|
| JWT signing (app authentication) | `@octokit/auth-app` (Node), `PyGithub` (Python), `go-github` (Go) |
| Installation token exchange | GitHub REST API: `POST /app/installations/{installation_id}/access_tokens` |
| User OAuth flow | GitHub App's built-in OAuth (same as OAuth App flow but scoped to the app) |
| Git operations | `simple-git` (Node), `libgit2`-based libraries, shell git with token in remote URL |

*Source: [Authenticating as a GitHub App installation — GitHub Docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)*

### Quality Assurance for the PAT Approach (if retained)

If the team decides to retain the PAT approach for MVP speed, the minimum quality bar is:

- Validate the PAT immediately on entry: call `GET /repos/{owner}/{repo}` with the token and confirm 200 response
- Validate the PAT has write access: check repo permissions from the response
- Store the PAT encrypted with AES-256 or equivalent, per-user, not shared
- Surface a clear re-authentication prompt when the PAT is revoked or expired
- Document an upgrade path to the GitHub App model for post-MVP

---

## 4. Technology Stack and Token Architecture

### Token Prefix Taxonomy

GitHub prefixes tokens to make their type identifiable:

| Prefix | Type | Expires | Used for |
|---|---|---|---|
| `ghp_` | Classic PAT | Configurable, default no expiry | User-created credentials |
| `github_pat_` | Fine-grained PAT | Mandatory (up to 1 year) | User-created, repo-scoped credentials |
| `gho_` | OAuth App token | No (until revoked) | OAuth App authorization |
| `ghu_` | GitHub App user access token | Short-lived | User identity via GitHub App |
| `ghs_` | GitHub App installation token | 1 hour | Platform acting on behalf of installation |
| `ghb_` | GITHUB_TOKEN (Actions) | Workflow duration | CI/CD within Actions |

*Source: [Token authentication requirements for Git operations — GitHub Blog](https://github.blog/security/application-security/token-authentication-requirements-for-git-operations/)*

### Technology Adoption Patterns

GitHub's 2022 fine-grained PAT launch and its ongoing deprecation signals for classic PATs and OAuth Apps indicate a clear direction: the ecosystem is moving to GitHub Apps and fine-grained tokens. Building against classic PATs or OAuth App `repo` scope today means building against technology that GitHub is actively moving users away from.

The Travis CI documentation, which covers their legacy OAuth scope usage, is instructive as a cautionary example: their reliance on broad OAuth scopes (`repo`, `user`) is documented as a security concern in their own docs, and the GitHub community discussion on read-only OAuth scopes has been open for years with no resolution because OAuth Apps are not receiving new scope investments.

*Source: [Travis CI's use of GitHub API Scopes — Travis CI Docs](https://docs.travis-ci.com/user/github-oauth-scopes/)*
*Source: [Read-Only OAuth Scope — GitHub Community Discussion #7891](https://github.com/orgs/community/discussions/7891)*

---

## 5. Integration and Interoperability Patterns

### API Design: What the Platform Needs

For bmad-easy's MVP, the platform needs these GitHub API capabilities:

- **Read repository contents:** List `_bmad-output/` directory, read artifact files → `GET /repos/{owner}/{repo}/contents/{path}`
- **Write commits:** Push new artifact files → `PUT /repos/{owner}/{repo}/contents/{path}` or git push via HTTPS
- **Identify the user:** Get name, email, avatar → `GET /user`
- **Verify BMAD setup:** Check for `_bmad/` directory → `GET /repos/{owner}/{repo}/contents/_bmad`

All of these work with any token type (OAuth App token with `repo` scope, GitHub App installation token, or PAT with `repo` scope). The GitHub API is token-agnostic; the permission model determines what each token can do, not the API endpoint.

### Communication Protocol

All GitHub API and git operations use HTTPS. No SSH key management is needed. Installation tokens are passed as Bearer tokens in API requests and as HTTPS credentials for git operations. The protocol is identical across all token types.

### Interoperability: Organization Repositories

A key interoperability risk: **OAuth App restrictions**. GitHub organizations can enable a setting that blocks OAuth App access unless the org owner has approved that specific OAuth App. This restriction does not apply to GitHub Apps.

For bmad-easy, where the BMAD repo may be in a GitHub organization (likely, for any company with a GitHub org), the OAuth App `repo` scope approach has a real risk of failing silently for org repos without org owner approval. The GitHub App installation model sidesteps this entirely.

*Source: [GitHub OAuth 3rd Party App restrictions — CirriusTech](https://cirriustech.co.uk/blog/github-oauth-3rd-party-restrictions/)*
*Source: [Limiting OAuth app and GitHub App access requests — GitHub Docs](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/limiting-oauth-app-and-github-app-access-requests-and-installations)*

---

## 6. Security and Compliance Considerations

### Security Architecture Comparison

**PAT stored by platform:**
The platform becomes a long-lived credential store. This is a meaningful security liability. If a bmad-easy database breach occurs, all stored PATs are exposed. The attacker gains write access to every connected repository until each user manually revokes their token. Classic PATs have no mandatory expiry. Fine-grained PATs have mandatory expiry but users will set long durations to avoid re-authenticating.

**OAuth App token stored by platform:**
Same risk profile as PATs. Additionally, `gho_` tokens are broader in scope (all repos) making a breach more severe.

**GitHub App installation tokens:**
The platform stores the app's private key (used to sign JWTs) but not user tokens. The private key is a platform secret, not a user credential. If the installation token is compromised, it expires in 1 hour with no user action needed. The private key can be rotated by the platform. This is a substantially better security posture.

### Compliance Considerations

Platforms handling user credentials (PATs, OAuth tokens) may have obligations under SOC 2 or similar frameworks around credential storage, rotation, and exposure notification. The GitHub App model, by eliminating stored user credentials, simplifies compliance scope.

### Secure Development Practices

If the PAT approach is retained for MVP, the following are required:

- Encrypt PATs at rest with a platform-managed key (KMS or equivalent)
- Never log PAT values
- Implement re-authentication prompts when PATs expire or are revoked
- Scope user tokens to the minimum needed: if the platform only needs access to one repo, document this clearly so users can set fine-grained PATs accordingly

---

## 7. Strategic Technical Recommendations

### Primary Recommendation: GitHub App Model

**Build bmad-easy as a registered GitHub App.** This eliminates the PAT from the non-dev onboarding flow, aligns with GitHub's explicit guidance, matches the industry standard (Netlify, Vercel, Terraform Cloud), and maps cleanly to the existing PRD's developer-champion model.

Specific implementation guidance:

1. **Register the GitHub App** with: `Contents: read & write`, `Metadata: read-only` (required by GitHub for all apps)
2. **Assign the installation step to the developer champion.** Revise BMAD setup documentation to include "Install the bmad-easy GitHub App on this repository" as a prerequisite step. This is a one-time admin action the developer already performs during BMAD setup.
3. **Non-dev user onboarding** becomes: sign in with GitHub → select repository from a list of repos where the app is installed → proceed to Project Map. No PAT prompt.
4. **Git operations** use installation tokens with `x-access-token` authentication. Set commit author metadata to the signed-in user's GitHub name and email.
5. **Graceful fallback:** if the user selects a repo where the app is not installed, show a clear message: "Ask your team's developer to install bmad-easy on this repository first" with a link to the installation URL.

### PRD Impact

The PRD's UJ-1 (Sarah connecting the repository) should be revised:
- Remove: "The platform displays a link to GitHub documentation for generating an access token. She generates the token, pastes it into the provided field"
- Replace with: Sarah signs in with GitHub → the platform shows repositories where bmad-easy is installed → Sarah selects the team's repo → validation that `_bmad` is initialized → Project Map

The developer-champion step in the PRD should explicitly include GitHub App installation as part of BMAD setup.

### Alternative: PAT approach for MVP speed

If the team prioritizes MVP speed over the above, the PAT approach can be used as a short-term measure with these guardrails:
- Use fine-grained PAT guidance (not classic PAT) to limit scope to one repo
- Plan the GitHub App migration as a post-MVP milestone
- Accept the UX risk with non-dev users — consider whether a developer, not the PM, performs this step during setup

---

## 8. Implementation Roadmap and Risk Assessment

### Technical Implementation Framework

**Phase 1: GitHub App registration (platform admin task)**
- Register GitHub App in GitHub Developer Settings
- Set permissions: Contents (read & write), Metadata (read)
- Configure OAuth callback URL
- Generate and securely store private key
- Publish as a public app (anyone can install)

**Phase 2: Installation token infrastructure (backend)**
- Implement JWT generation using app private key
- Implement installation token exchange endpoint
- Implement token caching with <1hr TTL
- Handle token refresh transparently

**Phase 3: Onboarding flow revision (frontend + backend)**
- Replace PAT collection UI with GitHub OAuth sign-in
- Implement post-sign-in: list repos where app is installed and user has access
- Add "not installed" state with developer guidance
- Implement `_bmad` presence validation using installation token

**Phase 4: Git operations**
- Use installation tokens as HTTPS credentials for all push/pull
- Set git commit author fields from user's GitHub profile

### Technical Risk Management

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Developer doesn't install GitHub App before PM tries to connect | High | Medium | Clear "awaiting developer setup" state in UI; prompt with setup link |
| Org admin has disabled repo admin GitHub App installation | Low | High | Surface the error clearly; explain org admin must install the app |
| Installation token refresh fails mid-operation | Low | High | Retry with fresh token; surface error to user with retry option |
| GitHub App private key leaked | Very Low | Critical | Key rotation via GitHub App settings; installation tokens expire hourly regardless |
| PAT approach (if retained): PAT expires mid-session | Medium | Medium | Detect 401 responses; prompt re-authentication immediately |

---

## 9. Future Technical Outlook

### Emerging Technology Trends

GitHub is actively expanding the GitHub App permission model. Recent additions include fine-grained permissions for enterprise resources and improved scoping for organization-level access. The trajectory is clear: GitHub Apps will continue to receive new permissions and capabilities while OAuth Apps receive minimal investment.

Fine-grained PATs are also receiving continued investment as the recommended path for users who need personal tokens (developers running scripts, CI/CD without GitHub Apps). Classic PATs are being soft-deprecated.

**Near-term (1–2 years):** GitHub may introduce mandatory expiry for classic PATs or additional OAuth App restrictions. Platforms built on those models will face migration pressure.

**Medium-term (3–5 years):** GitHub Apps will likely receive capabilities currently unique to OAuth Apps (enterprise-level resources). The convergence reduces the one remaining reason to prefer OAuth Apps over GitHub Apps.

### Innovation Opportunities

The GitHub App model enables capabilities the PAT approach cannot support:
- **Webhook-driven updates:** GitHub Apps can receive webhooks for push events, enabling real-time Project Map updates when a developer commits via CLI (not just via the platform)
- **Repository visibility checks:** The app can list all installed repos, enabling a repository selector UX rather than requiring the user to type/paste a URL
- **Org-level installation:** A single app installation at the org level covers all repos in the org, enabling multi-repo support in future versions

---

## 10. Technical Research Methodology and Source Verification

### Source Documentation

**Primary sources (GitHub official):**
- [Differences between GitHub Apps and OAuth Apps — GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [Deciding when to build a GitHub App — GitHub Docs](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app)
- [Scopes for OAuth Apps — GitHub Docs](https://docs.github.com/enterprise-server@3.0/developers/apps/building-oauth-apps/scopes-for-oauth-apps)
- [Authenticating as a GitHub App installation — GitHub Docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
- [Generating a user access token for a GitHub App — GitHub Docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Installing a GitHub App from a third party — GitHub Docs](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party)
- [Managing personal access tokens — GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Token authentication requirements for Git operations — GitHub Blog](https://github.blog/security/application-security/token-authentication-requirements-for-git-operations/)
- [Introducing fine-grained personal access tokens — GitHub Blog](https://github.blog/security/application-security/introducing-fine-grained-personal-access-tokens-for-github/)
- [Easier builds and deployments using Git over HTTPS and OAuth — GitHub Blog](https://github.blog/news-insights/easier-builds-and-deployments-using-git-over-https-and-oauth/)
- [Block repository administrators from installing GitHub Apps — GitHub Changelog](https://github.blog/changelog/2025-12-01-block-repository-admins-from-installing-github-apps-now-generally-available/)
- [Limiting OAuth app and GitHub App access requests — GitHub Docs](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/limiting-oauth-app-and-github-app-access-requests-and-installations)

**Secondary sources (industry platforms and engineering blogs):**
- [Repository permissions and linking — Netlify Docs](https://docs.netlify.com/build/git-workflows/repo-permissions-linking/)
- [GitHub App vs. OAuth for Terraform integration — Hashicorp Blog](https://www.hashicorp.com/en/blog/github-app-vs-oauth-for-terraform-integration)
- [GitHub Apps vs. OAuth Apps: Choose the right GitHub connection — Logto Blog](https://blog.logto.io/github-apps-vs-oauth-apps)
- [GitHub App vs. GitHub OAuth: When to Use Which — Nango Blog](https://nango.dev/blog/github-app-vs-github-oauth/)
- [Integrating with GitHub — GitHub Apps and OAuth — Northflank Blog](https://northflank.com/blog/integrating-with-github-github-apps-and-oauth)
- [Replacing a GitHub Personal Access Token with a GitHub Application — Aembit Blog](https://aembit.io/blog/replacing-a-github-personal-access-token-with-a-github-application/)
- [GitHub OAuth 3rd Party App restrictions — CirriusTech](https://cirriustech.co.uk/blog/github-oauth-3rd-party-restrictions/)
- [Travis CI's use of GitHub API Scopes — Travis CI Docs](https://docs.travis-ci.com/user/github-oauth-scopes/)
- [Read-Only OAuth Scope — GitHub Community Discussion #7891](https://github.com/orgs/community/discussions/7891)

### Research Quality Assurance

- All technical claims about token behavior sourced from GitHub's official documentation
- Token type classification (prefixes, expiry) verified against GitHub engineering blog and changelog
- Platform behavior (Netlify, Vercel) verified against their respective official documentation
- Confidence level: **High** for all core findings — the GitHub documentation on this topic is clear, current, and authoritative

### Research Limitations

- Organization-specific behavior (org admin policies, OAuth App restrictions) can vary by organization configuration; the research describes defaults and options, not guaranteed behavior for any specific org
- GitHub App UX (installation flow, authorization screens) may change; screenshots and step counts are not provided as they can go out of date
- Fine-grained PAT expiry enforcement (maximum allowed duration) may be configurable at the org level in some plans

---

## 11. Technical Appendices and Reference Materials

### Appendix A: Pattern Decision Table

| Question | OAuth App + `repo` | OAuth + PAT | GitHub App |
|---|---|---|---|
| Does GitHub sign-in alone give repo access? | Yes (if `repo` scope requested) | No (PAT needed separately) | No (installation needed separately, but developer does this, not the PM) |
| Can the platform git push? | Yes | Yes | Yes (via installation token) |
| Does access survive the user leaving the team? | No (token tied to user) | No (PAT tied to user) | Yes (installation is repo-scoped) |
| Does access work for org repos? | Maybe (blocked if org has OAuth restrictions) | Yes | Yes |
| Does the non-dev user create a token? | No | **Yes — this is the friction point** | No |
| Does GitHub recommend this for platforms? | No (deprecated direction) | No (user tooling only) | **Yes** |
| Used by Netlify / Vercel? | No | No | **Yes** |

### Appendix B: Search Queries Used

- "GitHub OAuth App scopes repository read write access third-party platform 2025"
- "GitHub App vs OAuth App repository permissions comparison 2025"
- "GitHub fine-grained PAT vs OAuth token repository access difference"
- "GitHub OAuth sign-in can access git repository push pull commits"
- "GitHub OAuth token use as git credential HTTP clone push pull authentication"
- "GitHub App installation token git HTTPS clone push pull x-access-token"
- "GitHub App organization admin approval required install personal account repositories"
- "GitHub OAuth user access token git repository operations authentication 2024 2025"
- "SaaS platform GitHub integration PAT onboarding friction alternatives GitHub App 2024"
- "Vercel Netlify Linear GitHub App OAuth repository access onboarding approach"
- "GitHub App vs OAuth App user perspective onboarding UX install flow repository selection"

### Appendix C: PRD Section Affected by This Research

**Section 2.3, UJ-1 (Sarah connects the team's repository)** — The path currently reads:
> "The platform displays a link to GitHub documentation for generating an access token. She generates the token, pastes it into the provided field, and the platform validates the PAT..."

**Recommended revision:** This step should be replaced with a GitHub App installation check. If the developer champion has already installed the app, Sarah's experience becomes: sign in → select the team's repository from a list → validate `_bmad` initialization → proceed to Project Map. No token generation, no paste step.

The developer champion's setup path (not currently a full user journey in the PRD) should gain a step: install the bmad-easy GitHub App on the team's BMAD repository. This is one-time per team, performed by someone already comfortable with GitHub administration.

---

## Technical Research Conclusion

### Summary of Key Technical Findings

1. **GitHub OAuth sign-in does not provide repository access by default.** It depends on what scopes are requested. The `repo` scope gives read/write access to all repos the user can access — too broad. No read-only variant exists for private repos.

2. **All token types can authenticate git HTTP operations.** The choice of token affects scope, expiry, and security posture — not whether git operations are technically possible.

3. **The GitHub App model is the correct architecture** for bmad-easy. It eliminates PAT creation from the non-dev user onboarding flow, stores no long-lived user credentials, is scoped to the specific repos the app is installed on, and is what every comparable SaaS platform uses.

4. **The PRD's developer-champion model maps perfectly** onto the GitHub App installation step. The developer who installs BMAD is the right person to install the GitHub App. Non-dev users only ever need to sign in with GitHub — no developer tooling, no token management.

5. **The PAT approach in UJ-1 should be reconsidered.** It is the highest-friction step for the platform's most important user (the PM trying BMAD for the first time). Removing it removes the biggest onboarding barrier.

### Strategic Technical Impact Assessment

This research changes the PRD's onboarding model for UJ-1 and adds a developer setup step. The implementation complexity increases (GitHub App token management is more complex than PAT storage), but the product quality improvement is substantial: the platform's non-dev users never interact with GitHub developer settings, and the platform's security posture is significantly stronger.

### Next Steps

1. PM / architect decision: confirm GitHub App as the integration model in the PRD and architecture document
2. Architect: design the GitHub App token refresh infrastructure and the repo-installation association data model
3. PM: revise UJ-1 and add a developer setup journey (UJ-0 or precondition to UJ-1) that includes the GitHub App installation step
4. Developer champion documentation: update BMAD setup guide to include "Install bmad-easy GitHub App on this repository" as a prerequisite

---

**Technical Research Completion Date:** 2026-06-15
**Research Period:** Current comprehensive technical analysis (GitHub documentation as of 2025–2026)
**Source Verification:** All core technical claims cited with GitHub official documentation
**Technical Confidence Level:** High — based on GitHub official documentation, GitHub engineering blog, and verified platform documentation (Netlify, Vercel, Hashicorp)

_This research answers the specific architectural question posed against the bmad-easy PRD and provides actionable guidance for revising the onboarding model and integration architecture._
