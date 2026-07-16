# Custom Domain Setup

This runbook covers configuring a custom domain for the production deployment of `apps/web` on Vercel. It documents every step — both human-executed (DNS, OAuth App) and API-automatable (Vercel domain add, AUTH_URL update) — with exact commands, expected output, and decision criteria.

The `*.vercel.app` production URL (`https://bmad-easy.vercel.app`) remains functional throughout — the custom domain is an addition, not a replacement. The rollback procedure reverts to the `*.vercel.app` URL.

**Execution model:** Steps 1, 4, and 5 are human-executed (DNS requires DNS provider access; OAuth App management has no API). Steps 2 and 3 are API-automatable via Vercel REST API but are external service calls with side effects — the agent documents the commands; the human executes them.

---

## Prerequisites

**Vercel project details (operator reference):**

- Project ID: `prj_ih4UAxO759A1CHdrZ93j4rk3poYD`
- Org ID (team): `team_DV9hczWkgqbOEoMGnX9Pta3t`
- Current production URL: `https://bmad-easy.vercel.app`
- `VERCEL_TOKEN` is in `.env.local` (starts with `vcp_`). Export it before running curl commands: `export VERCEL_TOKEN=$(grep '^VERCEL_TOKEN=' .env.local | cut -d= -f2-)`

**GitHub OAuth App details (operator reference):**

- OAuth App ID: `Ov23liwPSopCBFh9nMRN` (in `.env` as `AUTH_GITHUB_ID`)
- Current callback URL: `http://localhost:3000/api/auth/callback/github` (not yet updated to production — deferred from Story 4.5)
- Story 4.9 updates the callback URL directly to the custom domain, superseding the Story 4.5 deferred item (DP-3: one step instead of two).

**Custom domain:**

- Replace `<custom-domain>` throughout this runbook with the actual domain name (e.g., `app.bmad-easy.com`). The actual domain is decided by the human operator before execution.
- For an apex domain (e.g., `bmad-easy.com`), use an A record (Step 1).
- For a subdomain (e.g., `app.bmad-easy.com`), use a CNAME record (Step 1).

---

## Step 1 — DNS Configuration (human-executed)

Configure DNS at the domain provider. This step requires DNS provider access — no API is available from the agent.

**For an apex domain (e.g., `bmad-easy.com`):**

Add an A record pointing to Vercel's IP address:

| Record Type | Name | Value |
|---|---|---|
| A | `@` | `76.76.21.21` |

**For a subdomain (e.g., `app.bmad-easy.com`):**

Add a CNAME record pointing to Vercel's DNS:

| Record Type | Name | Value |
|---|---|---|
| CNAME | `app` | `cname.vercel-dns.com` |

**Propagation:** DNS propagation may take up to 48 hours but is typically 5–15 minutes. Verify propagation with:

```bash
dig <custom-domain>
# or
nslookup <custom-domain>
```

The domain should resolve to `76.76.21.21` (A record) or `cname.vercel-dns.com` (CNAME record).

---

## Step 2 — Add Domain to Vercel Project (API-automatable, human-executed)

Add the custom domain to the Vercel project via the Vercel REST API. This is an external service call with side effects — the agent documents the command; the human executes it.

```bash
curl -X POST "https://api.vercel.com/v10/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/domains?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"<custom-domain>"}'
```

**Expected response:** `200 OK` with a domain object containing `verified: false` (verification pending until DNS propagates).

**Verify domain status:**

```bash
curl -s "https://api.vercel.com/v9/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/domains?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | jq '.domains[] | {name, verified}'
```

The domain shows `verified: true` once DNS resolves. Vercel automatically provisions TLS (Let's Encrypt) when the domain is verified — no manual TLS configuration is needed. The TLS certificate is provisioned within minutes of DNS verification.

---

## Step 3 — Update AUTH_URL Environment Variable on Vercel (API-automatable, human-executed)

Update the `AUTH_URL` environment variable on the Vercel project to the custom domain so Auth.js redirects and session callbacks use the stable URL. This is an external service call with side effects — the agent documents the command; the human executes it.

**Scope boundary:** Only `AUTH_URL` is in scope for this story. Other Vercel env vars (`AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `DATABASE_URL`) from the Story 4.5 deferred item are beyond this story's ACs and remain deferred.

**Check if AUTH_URL already exists:**

```bash
curl -s "https://api.vercel.com/v9/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/env?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | jq '.envs[] | select(.key == "AUTH_URL") | {id, key, target}'
```

**If AUTH_URL exists** (note the `id` from the response), update it:

```bash
curl -X PATCH "https://api.vercel.com/v9/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/env/<envId>?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"https://<custom-domain>","type":"encrypted","target":["production"]}'
```

**If AUTH_URL does not exist** (Story 4.5 Task 4 was not executed — deferred), create it:

```bash
curl -X POST "https://api.vercel.com/v10/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/env?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"https://<custom-domain>","type":"encrypted","target":["production"]}'
```

**Note:** The Vercel API returns `key` but not `value` for encrypted env vars. Verify the key exists and `target` includes `production`.

---

## Step 4 — Update GitHub OAuth App Callback URL (human-executed)

Update the GitHub OAuth App's callback URL to use the custom domain. This step is manual — no API exists for OAuth App management. This step supersedes the Story 4.5 deferred item (AC-4: GitHub OAuth App callback URL not updated). The callback URL was never at `*.vercel.app` — it is currently `http://localhost:3000/api/auth/callback/github`. Story 4.9 updates it directly to the custom domain (DP-3: one step instead of two).

1. Navigate to `https://github.com/settings/developers`.
2. Find the OAuth App with ID `Ov23liwPSopCBFh9nMRN`.
3. Update the **Authorization callback URL** to `https://<custom-domain>/api/auth/callback/github`.
4. Update the **Homepage URL** to `https://<custom-domain>`.
5. Click **Update application**.

---

## Step 5 — Verify End-to-End OAuth Flow (human-executed)

Verify the full OAuth flow works end-to-end against the custom domain. This is a manual sign-in test — not an automated browser test.

1. Open a browser in incognito mode.
2. Navigate to `https://<custom-domain>`.
3. Click **Sign in with GitHub**.
4. Complete the OAuth flow (authorize the app on GitHub).
5. Confirm the session is established — you should be redirected to the dashboard, not back to the sign-in page.

**If the OAuth flow fails, check:**

- (a) DNS has propagated (`dig <custom-domain>` or `nslookup <custom-domain>`).
- (b) Domain is verified on Vercel (Step 2 verification command shows `verified: true`).
- (c) `AUTH_URL` is set correctly (Step 3 — the value should be `https://<custom-domain>`).
- (d) OAuth App callback URL matches (Step 4 — should be `https://<custom-domain>/api/auth/callback/github`).

---

## Rollback Procedure

If the custom domain causes issues, revert by following these steps. The `*.vercel.app` URL remains functional throughout — it is never removed.

1. **Remove the custom domain from Vercel:**

```bash
curl -X DELETE "https://api.vercel.com/v9/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/domains/<custom-domain>?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN"
```

2. **Find the AUTH_URL env var ID:**

```bash
curl -s "https://api.vercel.com/v9/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/env?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | jq '.envs[] | select(.key == "AUTH_URL") | {id, key, target}'
```

Note the `id` from the response — this is the `<envId>` used in the next step.

3. **Revert AUTH_URL to the `*.vercel.app` production URL:**

```bash
curl -X PATCH "https://api.vercel.com/v9/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/env/<envId>?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"https://bmad-easy.vercel.app","type":"encrypted","target":["production"]}'
```

4. **Set the OAuth App callback URL to the `*.vercel.app` production URL:**

Navigate to `https://github.com/settings/developers` → find the OAuth App with ID `Ov23liwPSopCBFh9nMRN`. Set the **Authorization callback URL** to `https://bmad-easy.vercel.app/api/auth/callback/github`. Set the **Homepage URL** to `https://bmad-easy.vercel.app`.

**Note:** The OAuth App callback URL was never previously at `*.vercel.app` — it was at `http://localhost:3000/api/auth/callback/github` (Story 4.5 Task 6 was deferred). Rollback sets it to the `*.vercel.app` production URL, not reverts to it.

---

## Verification Record

**Date:** 2026-07-14

**Status:** Pending human execution of Steps 1–4. The verification commands below are to be run after the human has executed the DNS configuration, Vercel domain add, AUTH_URL update, and OAuth App callback URL update.

**Verification commands (read-only, run after human execution):**

1. **Verify the custom domain is added and verified:**

```bash
curl -s "https://api.vercel.com/v9/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/domains?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | jq '.domains[] | {name, verified}'
```

Expected: the custom domain appears with `verified: true`.

2. **Verify AUTH_URL is set to the custom domain:**

```bash
curl -s "https://api.vercel.com/v9/projects/prj_ih4UAxO759A1CHdrZ93j4rk3poYD/env?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | jq '.envs[] | select(.key == "AUTH_URL") | {key, target}'
```

Expected: the `AUTH_URL` entry exists and `target` includes `production`. The API returns `key` but not `value` for encrypted vars — verify the key exists and `target` includes `production`.

3. **Record the verification results:**

After running the verification commands, record the results (commands, output summary, date) in this section. Update the date to reflect the actual verification date.

**Credential isolation:** All verification commands use `$VERCEL_TOKEN` as an environment variable reference. No token values, API keys, or connection strings with passwords are recorded in this runbook.
