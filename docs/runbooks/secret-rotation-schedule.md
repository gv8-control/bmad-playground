# Secret Rotation Schedule

This runbook documents the rotation schedule for all production secrets in the bmad-easy platform. It lists each secret, its rotation interval (90 days for API keys, 180 days for OAuth secrets), the manual steps to rotate each, and references the KEK rotation runbook for `CREDENTIAL_ENCRYPTION_KEK`.

An operator reading this runbook should be able to rotate any production secret without consulting any other document (except `docs/runbooks/kek-rotation.md` for the KEK).

**Execution model:** Secret rotation is a manual procedure — this runbook documents the steps. The GitHub Actions cron workflow (`.github/workflows/secret-rotation-reminder.yml`) creates GitHub issues as reminders when a secret approaches or passes its rotation due date. The workflow does not perform automated rotation (see Section 6 — Out of Scope).

**Rotation intervals:**
- API keys (`DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`): 90 days
- OAuth secrets (`AUTH_GITHUB_SECRET`, `AUTH_SECRET`): 180 days
- Platform encryption key (`CREDENTIAL_ENCRYPTION_KEK`): 180 days (ref: `docs/runbooks/kek-rotation.md`)

---

## Prerequisites

**Production launch date:** `<production-launch-date>` — the date the platform first went live in production. Used to calculate initial rotation due dates (launch date + rotation interval). If the exact date is unknown, determine it via `gh run list --workflow=deploy.yml --status=success --limit=1000 --json createdAt --jq 'min_by(.createdAt) | .createdAt'` (the oldest successful deploy workflow run — `gh run list` returns newest first by default, so `--limit=1` would return the most recent deploy, not the first).

**Production URLs (operator reference):**

- `apps/web`: `https://bmad-easy.vercel.app` (Vercel, custom domain per Story 4.9)
- `apps/agent-be`: `https://agent-be-production-1c09.up.railway.app` (Railway, HTTP/2 confirmed per Story 4.7)

**Platform dashboard access:**

- **Vercel dashboard** — for `AUTH_SECRET`, `AUTH_GITHUB_SECRET`, `AUTH_URL`, `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK` (apps/web environment variables)
- **Railway dashboard** — for `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`, `DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `AUTH_SECRET` (apps/agent-be environment variables)
- **GitHub OAuth App settings** at `github.com/settings/developers` — for `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` (the OAuth App is `Ov23liwPSopCBFh9nMRN`). The callback URL must match the production URL.

**KEK rotation runbook:** `CREDENTIAL_ENCRYPTION_KEK` rotation follows the dedicated KEK rotation runbook at `docs/runbooks/kek-rotation.md`. This runbook references it, does not duplicate it.

**Config file:** `.github/secret-rotation-config.json` is the machine-readable source of truth for secret names, rotation intervals, and the production launch date. The cron workflow reads it to calculate due dates. If a secret's rotation interval changes, update both the config file and this runbook.

---

## Secret Inventory

| Secret | Platform | Interval | Category | Due Date Calculation | Runbook Section |
|---|---|---|---|---|---|
| `DAYTONA_API_KEY` | Railway | 90 days | API key | launch date + 90 days | Section 1 |
| `ANTHROPIC_API_KEY` | Railway | 90 days | API key | launch date + 90 days | Section 2 |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App + Vercel | 180 days | OAuth secret | launch date + 180 days | Section 3 |
| `AUTH_SECRET` | Vercel + Railway | 180 days | OAuth secret | launch date + 180 days | Section 4 |
| `CREDENTIAL_ENCRYPTION_KEK` | Vercel + Railway | 180 days | Platform secret (ref: `docs/runbooks/kek-rotation.md`) | launch date + 180 days | Section 5 |

---

## Section 1 — `DAYTONA_API_KEY` rotation (Railway, 90 days)

`apps/agent-be` uses the Daytona API key to provision, clone, and destroy sandboxes via `@daytonaio/sdk`. The key is read at startup via `apps/agent-be/src/config/env.validation.ts` (`z.string().optional().default('')` — optional with empty default).

**Impact of a stale key:** All new Conversation provisioning fails. Existing conversations continue until the sandbox is destroyed.

### Manual rotation steps

1. **Generate a new Daytona API key** from the Daytona dashboard.
2. **Update `DAYTONA_API_KEY`** in the Railway project environment (service: `apps/agent-be`).
3. **Redeploy `apps/agent-be`** — the key is read at startup.
4. **Verify:** Open a new Conversation — sandbox provisioning should succeed.
5. **Revoke the old key** from the Daytona dashboard.

---

## Section 2 — `ANTHROPIC_API_KEY` rotation (Railway, 90 days)

`apps/agent-be` injects `ANTHROPIC_API_KEY` into each Daytona sandbox as an environment variable at provision time. Validated by `apps/agent-be/src/config/env.validation.ts` at startup (`z.string().min(1)` — required, non-empty).

**Impact of a stale key:** All agent runs fail with 401 from the Anthropic API. Existing conversations with running sandboxes continue to use the old key until the sandbox is destroyed and re-provisioned.

### Manual rotation steps

1. **Generate a new Anthropic API key** from the Anthropic console.
2. **Update `ANTHROPIC_API_KEY`** in the Railway project environment (service: `apps/agent-be`).
3. **Redeploy `apps/agent-be`.**
4. **Verify:** Open a new Conversation and send a message — the agent should respond.
5. **Revoke the old key** from the Anthropic console.

---

## Section 3 — `AUTH_GITHUB_SECRET` rotation (GitHub OAuth App + Vercel, 180 days)

`AUTH_GITHUB_SECRET` is used by Auth.js (`next-auth`) to authenticate the OAuth flow with GitHub. Configured in `apps/web/src/lib/auth.ts`.

**Impact of a stale secret:** All new sign-ins fail. Active sessions (JWT-based) are unaffected until they expire (8h maxAge).

### Manual rotation steps

1. **Generate a new OAuth App secret** at `github.com/settings/developers` (the OAuth App is `Ov23liwPSopCBFh9nMRN`).
2. **Update `AUTH_GITHUB_SECRET`** in the Vercel project environment.
3. **Redeploy `apps/web`** — the secret is read at startup by Auth.js.
4. **Verify:** Sign out and sign in with GitHub — the OAuth flow should complete.
5. **The old secret becomes invalid immediately** — active sessions are unaffected (they use the JWT, not the OAuth secret), but new sign-ins require the updated secret.

---

## Section 4 — `AUTH_SECRET` rotation (Vercel + Railway, 180 days)

`AUTH_SECRET` has a **dual purpose** — it is used for both Auth.js session JWT signing/verification AND boundary JWT signing. This was previously undocumented (deferred finding). The four usage sites are:

1. **Auth.js session JWT signing/verification** (`apps/web/src/lib/auth.ts`)
2. **Boundary JWT minting** (`apps/web/src/lib/boundary-jwt.ts` — `new SignJWT().setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(process.env.AUTH_SECRET))`)
3. **Boundary JWT REST guard verification** (`apps/agent-be/src/common/guards/boundary-jwt.guard.ts` — `jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), { issuer, audience })`)
4. **Boundary JWT SSE guard verification** (`apps/agent-be/src/streaming/streaming.controller.ts` — same `jwtVerify` call)

Both services MUST use the same `AUTH_SECRET` value for boundary JWTs to work — the boundary JWT is minted by `apps/web` and verified by `apps/agent-be`.

**Impact of rotating `AUTH_SECRET`:**
- **Invalidates ALL active Auth.js sessions** — users are signed out.
- **Invalidates ALL active boundary JWTs** — existing Conversation SSE connections fail until the page is reloaded, which mints a new boundary JWT.
- This is expected — users simply sign in again and reload their Conversation tabs.

### Manual rotation steps

1. **Generate a new secret** with `openssl rand -hex 32`.
2. **Update `AUTH_SECRET` on BOTH Vercel (apps/web) AND Railway (apps/agent-be)** — the boundary JWT is signed by `apps/web` and verified by `apps/agent-be`; both must use the same value. Update both platforms simultaneously.
3. **Redeploy BOTH `apps/web` and `apps/agent-be`.**
4. **Verify:** Sign in, open a Conversation, send a message — the agent should respond. If the boundary JWT secret mismatch exists, the SSE connection fails with an auth error.
5. **Document the rotation** in the Verification Record below.

---

## Section 5 — `CREDENTIAL_ENCRYPTION_KEK` rotation (Vercel + Railway, 180 days)

`CREDENTIAL_ENCRYPTION_KEK` is a 64-char hex string (32 bytes) used for AES-256-GCM envelope encryption of OAuth tokens. It is used by:
- `apps/web/src/lib/crypto.ts` for envelope encryption (encryption path)
- `apps/agent-be/src/credentials/encryption.service.ts` for DEK unwrapping (decryption path, via `EncryptionService` → `CredentialsService` → `ConversationsService`)

Both services MUST have the same KEK value. The KEK wraps all per-user DEKs; rotation re-wraps DEKs without touching token ciphertext; users are unaffected during rotation.

### Manual rotation steps

1. **Follow the procedure in `docs/runbooks/kek-rotation.md`** — the dedicated KEK rotation runbook documents the full 10-step procedure (generate, backup, dry-run, rotate, verify, flip env var, convergence pass, smoke-test, retire old KEK).
2. **Rotation interval:** 180 days.
3. **Impact summary:** KEK wraps all per-user DEKs; rotation re-wraps DEKs without touching token ciphertext; users are unaffected during rotation.
4. **After KEK rotation is complete**, update the `CREDENTIAL_ENCRYPTION_KEK` value on BOTH Vercel (apps/web — `apps/web/src/lib/crypto.ts` uses it for envelope encryption) AND Railway (apps/agent-be — `apps/agent-be/src/credentials/encryption.service.ts` uses it for DEK unwrapping). Redeploy BOTH `apps/web` and `apps/agent-be`.

**Note:** The dedicated KEK rotation runbook (`docs/runbooks/kek-rotation.md`) currently documents only the Vercel side of KEK rotation. The Railway side must also be updated — `apps/agent-be` uses the KEK at runtime (`encryption.service.ts` → `CredentialsService` → `ConversationsService`). A future story touching `kek-rotation.md` should add the Railway update step.

---

## Section 6 — Out of Scope

The following are explicitly out of scope for this story:

- **Automated secret rotation (no human in the loop):** This story delivers reminders only, not rotation automation. The cron job creates GitHub issues to track upcoming rotations; the actual rotation is a manual procedure documented in Sections 1-5. Automated rotation would require platform API access to update environment variables programmatically, which is not part of the MVP.
- **`DATABASE_URL` rotation (Railway Postgres):** Railway manages the Postgres connection string; rotating it requires a Railway support ticket and is not a routine operation. The `DATABASE_URL` is not included in the rotation schedule or the config file.

---

## Rollback Procedure

If a secret rotation causes issues, revert by restoring the previous secret value. The rollback approach depends on whether the old secret was revoked.

### Step 1 — If the old secret value is still available

Update the environment variable back to the old value and redeploy the affected service(s). This is the simplest rollback path — the old value is still valid and no external service state has changed.

### Step 2 — If the old secret was revoked

For secrets revoked via external dashboards (Daytona API key, Anthropic API key, GitHub OAuth App secret), the old value **cannot be recovered**. A new key must be generated from the respective dashboard:

- **`DAYTONA_API_KEY`:** Generate a new key from the Daytona dashboard.
- **`ANTHROPIC_API_KEY`:** Generate a new key from the Anthropic console.
- **`AUTH_GITHUB_SECRET`:** Generate a new secret for the OAuth App `Ov23liwPSopCBFh9nMRN` at `github.com/settings/developers`. Then update `AUTH_GITHUB_SECRET` in the Vercel project environment, redeploy `apps/web`, and verify the OAuth flow completes.
- **`AUTH_SECRET`:** Generate a new secret with `openssl rand -hex 32`.
- **`CREDENTIAL_ENCRYPTION_KEK`:** Follow the rollback procedure in `docs/runbooks/kek-rotation.md`.

### Step 3 — `AUTH_SECRET` rollback requires simultaneous update

Rolling back `AUTH_SECRET` requires updating both Vercel and Railway simultaneously — the boundary JWT is minted by `apps/web` and verified by `apps/agent-be`; both must use the same value. Update both platforms and redeploy both services.

### Step 4 — `CREDENTIAL_ENCRYPTION_KEK` rollback

Follow the rollback procedure in `docs/runbooks/kek-rotation.md`. The preferred rollback is a swapped re-rotation, not a backup restore.

---

## Verification Record

**Date:** 2026-07-14

### Production launch date

**Status:** Pending human confirmation. The production launch date (`<production-launch-date>`) must be determined by the human. If the exact date is unknown, determine it via:

```bash
gh run list --workflow=deploy.yml --status=success --limit=1000 --json createdAt --jq 'min_by(.createdAt) | .createdAt'
```

This returns the oldest successful deploy workflow run (`gh run list` returns newest first by default, so `--limit=1` would return the most recent deploy, not the first). Document the date in `.github/secret-rotation-config.json` (`productionLaunchDate` field) and update this record.

### Initial rotation due dates

Once the production launch date is confirmed, the initial rotation due dates are:

| Secret | Interval | Initial Due Date |
|---|---|---|
| `DAYTONA_API_KEY` | 90 days | `<production-launch-date>` + 90 days |
| `ANTHROPIC_API_KEY` | 90 days | `<production-launch-date>` + 90 days |
| `AUTH_GITHUB_SECRET` | 180 days | `<production-launch-date>` + 180 days |
| `AUTH_SECRET` | 180 days | `<production-launch-date>` + 180 days |
| `CREDENTIAL_ENCRYPTION_KEK` | 180 days | `<production-launch-date>` + 180 days |

### First issue creation (pending human confirmation)

**Status:** Pending human execution. The GitHub Actions cron workflow (`.github/workflows/secret-rotation-reminder.yml`) supports `workflow_dispatch` for manual triggering. The human must:

1. Set the `productionLaunchDate` in `.github/secret-rotation-config.json` to the actual production launch date.
2. Trigger the workflow manually via `gh workflow run secret-rotation-reminder.yml` (requires `GITHUB_TOKEN` with `workflow` scope).
3. Confirm the first issue is created (or document that no secrets are due yet if the production launch was recent).

Creating a GitHub issue is an externally visible effect — per the decision policy, this must be escalated. The agent creates the workflow YAML, the runbook, the config file, and the regression guard test. The human triggers the first run and confirms the issue is created.

**Credential isolation:** No token values, API keys, or connection strings with passwords are recorded in this runbook. All variable values use `<placeholder>` syntax.
