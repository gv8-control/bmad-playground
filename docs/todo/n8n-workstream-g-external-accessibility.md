# Workstream G — External accessibility of the dev machine

> **Status: Implemented (2026-07-19).** Tailscale running inside the
> devcontainer; tailnet joined; `WEBHOOK_URL` set to the Tailscale hostname;
> form resume URLs verified end-to-end from phone. Persistence wired via
> `.devcontainer/create.sh` (install) and `.devcontainer/start.sh` (start +
> authenticate). E3 (Workstream F) is now a no-op — see
> [Coordination with E3](#coordination-with-e3-webhook_url).

Implementation plan for making n8n reachable from outside the local network,
so the operator can interact with the pipeline from a phone when away from
the devbox. Extracted from Workstream F (notification channels) —
reachability is a separate problem from notification channel architecture and
is owned here.

> **Central constraint:** n8n runs on the dev machine, which is not
> immediately accessible from outside the local network. The operator wants to
> interact with n8n from a phone when away. `localhost` and LAN IPs do not
> resolve when away.

> **Verification basis (2026-07-17):** External claims were verified against
> official documentation in Workstream F — see [Sources](#sources) at the end.

## Decision

**Tailscale (plain).** Both the devbox and the phone join a tailnet; n8n is
reached at `http://<tailscale-host>:5678` over WireGuard.

Justification:

- Operator accepts phone-side app setup (Tailscale app on phone, connected to
  tailnet when accessing n8n).
- Single user — no need for an identity-provider model.
- Phone is always on trusted, encrypted networks.
- Keeps n8n private to the tailnet — does not expose it to the public
  internet.

## Interaction channels

Two distinct channels are enabled by this work. They share the same network
path (Tailscale to n8n port 5678) but serve different purposes. Both are
paths under n8n's single web server — Tailscale exposes the whole port, so
both become reachable together; no separate configuration needed.

### Channel 1 (the requirement): n8n waiting forms — D7 fallback

When a workflow pauses for human input, n8n generates a form resume URL.
This is the **form-from-phone fallback** (D7) in Workstream F's notification
architecture — an **alternate channel** for operator interaction when
Telegram notifications alone are insufficient (e.g., when structured input is
needed, or when the operator must choose between options presented as a
form).

This channel consists of:

- **Form input page** — the page that renders the form for the operator to
  fill in (typically `/form/<id>`).
- **Form submission endpoint** — the URL that accepts the submitted form
  data (typically `/webhook/<path>`).

This is the channel that gates Workstream F's D7. Until Tailscale is in
place, the form fallback works only from the devbox (localhost-to-localhost).
This doc exists to unblock that channel.

### Channel 2 (side effect): n8n web UI

Full web UI access from the phone — editing workflows, viewing executions,
etc. Not required for D7, but comes free with the same Tailscale setup since
port 5678 is exposed at the port level. The operator may or may not use
this; it does not change the implementation.

## Related workstreams

- `docs/todo/n8n-workstream-f-notification-channels.md` — owns E3
  (`WEBHOOK_URL` env fix) and D7 (form-from-phone fallback). D7 is the channel
  this doc unblocks.
- `docs/todo/n8n-workstream-d-security-perimeter.md` — owns F-1
  (unauthenticated RCE webhook) and D2 (webhook auth).
- `docs/todo/env-file-cleanup-plan.md` — documents where `WEBHOOK_URL` should
  live in the env files.

## Environment

The devbox is a devcontainer running on the dev's local machine (image
`mcr.microsoft.com/devcontainers/universal:5`). Concrete runtime facts an
implementer needs:

- **n8n process:** runs via PM2 inside the devcontainer, started by
  `.devcontainer/start.sh`:
  `pm2 start "$(which n8n)" --name n8n`. A worker process is also started.
  n8n is a native binary, not a container.
- **Postgres + Redis:** run via `docker compose up -d --wait` (start.sh) using
  `docker-compose.yml`. Only `postgres-n8n` and `redis-n8n` services are
  defined — n8n itself is not in the compose file.
- **Env loading:** start.sh sources `.env` then `.env.local`:
  `set -a; . .env; [ -f .env.local ] && . .env.local; set +a`.
- **n8n env vars:** live in `.env`, in the `# ─── n8n ───` section.
  `N8N_HOST=0.0.0.0` — n8n already listens on all interfaces, so no bind
  change needed for tailnet access.
- **`WEBHOOK_URL`:** now set to
  `http://bmad-codespace.tail0d7953.ts.net:5678` in `.env` (set by this
  workstream). Previously unset — the F-11/E3 baseline was unreachable
  `0.0.0.0` URLs.
- **Restart after env change:** `pm2 restart n8n n8n-worker --update-env`
  (the `--update-env` flag is required so PM2 re-reads the environment;
  a plain restart reuses the cached env).
- **Tailscale daemon:** no systemd in the container, so `tailscaled` is
  started directly (not via `systemctl`). State lives at
  `/var/lib/tailscale/tailscaled.state`; the socket at
  `/var/run/tailscale/tailscaled.sock`.

## Prerequisites

- Tailscale account (free tier sufficient for single user).
- Devbox (the devcontainer, already running n8n on port 5678).
- Phone (iOS or Android).

## Implementation steps

All steps completed 2026-07-19.

1. **Install Tailscale on the devbox.** ✅
   - Installed via `curl -fsSL https://tailscale.com/install.sh | sh` (v1.98.9).
   - `tailscaled` started directly (no systemd in the container): 
     `tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock --port=41641`.
   - **Placement resolved:** Tailscale runs inside the container. `/dev/net/tun`
     exists, UDP egress works (direct WireGuard, not DERP fallback). No host
     fallback needed.
   - **Persistence:** `.devcontainer/create.sh` installs Tailscale on
     container creation/rebuild. `.devcontainer/start.sh` starts `tailscaled`
     and authenticates on every start (if `TAILSCALE_AUTH_KEY` is set in
     `.env.local`).

2. **Install Tailscale on the phone.** ✅
   - Android (Samsung S23 FE). Authenticated with the same account.

3. **Enable MagicDNS on the tailnet.** ✅
   - MagicDNS enabled. Hostname: `bmad-codespace.tail0d7953.ts.net`.
   - `--accept-dns=true` used so the container self-resolves the hostname
     (Tailscale's DNS forwards non-tailnet queries upstream; normal DNS
     unaffected). This matters because n8n generates URLs with the Tailscale
     hostname, and some workflow patterns (e.g., Workstream F's Telegram
     handler) may internally call those URLs.

4. **Verify tailnet connectivity from the phone.** ✅
   - n8n web UI loads at `http://bmad-codespace.tail0d7953.ts.net:5678`
     from the phone.

5. **Set `WEBHOOK_URL` in `.env` (coordinates with E3).** ✅
   - `WEBHOOK_URL=http://bmad-codespace.tail0d7953.ts.net:5678` set in `.env`,
     in the `# ─── n8n ───` section.
   - Applied via `pm2 restart n8n n8n-worker --update-env` (the `--update-env`
     flag is required so PM2 re-reads the environment).
   - E3 (Workstream F) is now a no-op — see
     [Coordination with E3](#coordination-with-e3-webhook_url) below.

6. **Verify the waiting-form channel end-to-end.** ✅
   - Created a test workflow (`WS-G Tailscale Verify`) with a manual trigger
     → Wait node (resume: form). Executed it; n8n generated
     `resumeFormUrl=http://bmad-codespace.tail0d7953.ts.net:5678/form-waiting/274`.
   - Opened the form URL from the phone (Tailscale connected). Form rendered
     with title "Workstream G — Tailscale Verification". Submitted a test
     response. Execution resumed on the devbox (status: success).
   - Test workflow archived after verification.

## Coordination with E3 (`WEBHOOK_URL`)

E3 (owned by Workstream F) planned to set `WEBHOOK_URL=http://localhost:5678`.
**G landed first** — this workstream set `WEBHOOK_URL` directly to
`http://bmad-codespace.tail0d7953.ts.net:5678`. **E3 is now a no-op.** The
Tailscale URL is strictly more capable than localhost: localhost still works
localhost-to-localhost on the devbox because the tailnet interface is on the
same machine, and the Tailscale URL also works from the phone.

No other touchpoint with Workstream F.

## Gotchas

- **Phone app must be running.** Links to `http://<tailscale-host>:5678` only
  resolve when the Tailscale app on the phone is running and connected to the
  tailnet. If the app is closed, the URL fails silently (DNS won't resolve).
- **HTTP at app layer, WireGuard at network layer.** n8n serves HTTP, not
  HTTPS. WireGuard encrypts the tailnet traffic at the network layer, so HTTP
  is fine over the tailnet.
- **Tailnet hostname stability.** The `<tailscale-host>` portion is stable as
  long as the devbox's Tailscale node name doesn't change. If you rename the
  node in the admin console, update `WEBHOOK_URL` in `.env` and
  `pm2 restart n8n n8n-worker`.
- **Devcontainer is not Daytona-backed.** The devbox is a devcontainer on the
  dev's local machine, not a Daytona sandbox. Daytona is used as a client
  from inside the container to spawn pipeline sandboxes — it is not the
  container host. Tailscale runs inside the container directly: `/dev/net/tun`
  exists, UDP egress works (direct WireGuard, not DERP fallback), and no host
  fallback is needed. (The original draft of this doc incorrectly assumed a
  Daytona-backed container and deferred Tailscale placement to implementation
  time.)
- **Tailscale hostname appears in ntfy payloads.** The 8 alert nodes' `click`
  URLs use `bmad-codespace.tail0d7953.ts.net` (hardcoded in the node
  parameters, not derived from `WEBHOOK_URL`). ntfy.sh receives this hostname
  in the `click` body parameter of every alert notification. The operator
  accepted this as fine — the hostname is unreachable without tailnet
  membership, so leaking it to ntfy.sh does not create an attack vector. If
  the tailnet is ever dissolved or the hostname changes, update both
  `WEBHOOK_URL` in `.env` and the 8 alert nodes' `click` parameters (5 in
  Develop Epic, 3 in BMAD Session).

## Alternatives (archived)

The following alternatives were evaluated and not chosen. Preserved here so
future work does not re-litigate them.

### Tailscale Funnel

Publishes a tailnet service to the public internet as a stable
`https://<machine>.<tailnet-name>.ts.net` URL [Tailscale docs:
kb/1223/funnel]. Phone needs nothing installed. **Not chosen** because it
exposes n8n to the public internet. Operator accepts phone-side app setup, so
Funnel's zero-phone-setup advantage is not needed.

### Cloudflare Tunnel + Cloudflare Access

`cloudflared` tunnels `localhost:5678` to a public hostname with no port
forwarding; Cloudflare Access (Zero Trust) requires identity verification.
Free tier supports up to 50 users [Cloudflare: cloudflare.com/pricing].
Supported identity providers include Google, GitHub, and one-time PIN (OTP)
— among others [Cloudflare docs:
cloudflare-one/integrations/identity-providers]. **Not chosen** because
operator is a single user on trusted networks — the identity-provider model
is unnecessary overhead. Tailscale (plain) is lower infra burden for the same
outcome.

### SSH reverse tunnel to a VPS

`ssh -R` from devbox to a VPS with a domain; `WEBHOOK_URL` points at the VPS.
`-R` allocates a listener on the remote (VPS) side, forwarding to the local
devbox [OpenSSH man page: man.openbsd.org/ssh]. Fully self-hosted, no
third-party trust. **Not chosen** because it accepts the highest maintenance
burden (reconnect logic, TLS, key rotation, `GatewayPorts` config) for
control that the operator does not need. Tailscale handles NAT traversal and
reconnection automatically.

### Decision framework (reference)

| Solution | Phone-side setup | Widens F-1? | Infra burden | Reliability |
| --- | --- | --- | --- | --- |
| **Tailscale (plain) — chosen** | App + tailnet membership | No | Low | High |
| Tailscale Funnel | None | Yes | Low | High |
| Cloudflare Tunnel + Access | None | No (hardens) | Medium | High |
| SSH reverse tunnel | None | Depends on auth | High | Medium |

## Sources

External claims verified against official documentation on 2026-07-17 (in
Workstream F).

### Tailscale

| Claim | URL |
| --- | --- |
| Funnel: public internet access, `https://<machine>.<tailnet-name>.ts.net` | https://tailscale.com/kb/1223/funnel |
| WireGuard data-plane encryption | https://tailscale.com/docs/concepts/tailscale-encryption |
| NAT traversal, no port forwarding, MagicDNS stable hostnames | https://tailscale.com/kb/1017/install |

### Cloudflare

| Claim | URL |
| --- | --- |
| Zero Trust free tier: up to 50 users | https://www.cloudflare.com/pricing/ |
| Identity providers: Google, GitHub, OTP (among others) | https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/ |

### OpenSSH

| Claim | URL |
| --- | --- |
| `-R` remote port forwarding; loopback-only bind by default; `GatewayPorts` | https://man.openbsd.org/ssh |
