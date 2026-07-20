# Env File Cleanup Plan

## Problem

`.env.local` is a misleading name. In Next.js/Vite, `.env.local` means "local override of `.env`" — same variables, different values. Here it holds a completely disjoint set of tooling credentials the app must never read. This caused the E2E auth desync bug (ledger entry 57) and recurring confusion about whether all env files should be loaded together.

## Current state

| File | Tracked? | Purpose | Consumer |
|---|---|---|---|
| `.env.example` | Yes | App secret template | Documentation |
| `.env.local.example` | Yes | Tooling credential template | Documentation |
| `.env` | No | App secrets (dev) | apps/web, apps/agent-be, n8n |
| `.env.test` | No | App secrets (E2E) | Playwright runner |
| `.env.local` | No | Tooling credentials | opencode, CLIs, seed-mcp-auth |

Issues:
- `.env.local` is auto-loaded by Next.js, leaking tooling credentials into the app env
- `.env` contains tooling credentials that don't belong there (GITHUB_TOKEN, MISTRAL_API_KEY)
- `.env.example` has drifted from `.env` (5 undocumented variables)
- `.gitignore` catch-all (`.env*` at line 67) makes example file survival accidental
- Three hand-rolled env parsers with the same blind spots (no quote stripping, no `export` prefix)

## Target state

| File | Purpose | Next.js auto-loads? |
|---|---|---|
| `.env` | App secrets for local dev | Yes |
| `.env.test` | App secrets for E2E (synthetic sessions, fixed AUTH_SECRET) | No |
| `.env.tooling` | Personal/tooling credentials — dev machine only | No |
| `.env.example` | Template for `.env` | N/A |
| `.env.tooling.example` | Template for `.env.tooling` | N/A |

Rules:
- No file is auto-loaded by two consumers
- No variable appears in two files (except `.env`/`.env.test` where a test needs a different value)
- File names self-document their consumer

## Work items

### WM-1: Rename `.env.local` -> `.env.tooling`

Rename file and `.env.local.example` -> `.env.tooling.example`. Update all references:

- `.devcontainer/start.sh:9`, `.devcontainer/create.sh:15,27`
- `playwright/scripts/seed-mcp-auth.mjs:16,36,39,71`
- `docs/runbooks/custom-domain-setup.md:18`
- `docs/runbooks/monitoring-setup.md:24-25,106,126,142`
- `docs/runbooks/db-restore.md:20-21,310`
- `CLAUDE.md:82`
- `.gitignore:10`

Verification: `grep -r '\.env\.local'` returns zero hits in live code (excluding `_bmad-output/` historical artifacts).

### WM-2: Audit and relocate misplaced variables

Verify consumers, then move tooling credentials out of `.env`:

| Variable | Currently in | Target | Notes |
|---|---|---|---|
| `GITHUB_TOKEN` | `.env` + `.env.example` | `.env.tooling` | MCP server credential |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | `.env` only | `.env.tooling` | MCP server credential |
| `MISTRAL_API_KEY` | `.env` only | `.env.tooling` | Not referenced by app code (verify) |
| `ANTHROPIC_API_KEY` | `.env` only | Stay in `.env` + add to `.env.example` | Consumed by agent-be proxy |
| `AUTH_GITHUB_DEV_ID/SECRET` | `.env` only | Verify consumer first | May be app or tooling |
| `WEBHOOK_URL` | Not yet set | `.env` (n8n section) | Added by Workstream F (E3). Set to `http://localhost:5678`. Controls `$execution.resumeUrl` base. |

Requires: `grep -r '<VAR>' apps/ --include='*.ts' --include='*.tsx'` for each variable before moving.

### WM-3: Fix `.gitignore`

Replace lines 8-12 and line 67 with:

```gitignore
# env — all env files are gitignored except templates
.env
.env.*
!.env.example
!.env.*.example
```

### WM-4: Document the env file taxonomy

Add taxonomy header to `.env.example` and `.env.tooling.example` explaining which file is for which consumer and the rule: app variables in `.env`/`.env.test`, tooling variables in `.env.tooling`.

### WM-5: Consolidate hand-rolled env parsers (optional, low priority)

Three parsers with the same blind spots (no quote stripping, no `export` prefix, no inline comments):
- `seed-mcp-auth.mjs` `loadEnvLocal()` -> replace with `dotenv.config({ path: '.env.tooling', override: true })`
- Runbook `grep | cut` patterns -> replace with `set -a; source .env.tooling; set +a`
- `getDatabaseUrl()` in integration tests -> already patched during Story 4.4

## Migration sequence

1. WM-2 (audit variables) — verify consumers before moving anything
2. WM-1 (rename `.env.local`) — single coordinated rename, one commit
3. WM-3 (fix `.gitignore`) — after rename so patterns match
4. WM-4 (document taxonomy) — after files are in final state
5. WM-5 (parser cleanup) — optional, independent

## What NOT to change

- Do not merge `.env` and `.env.test` — deliberate isolation prevents auth desync
- Do not rename `.env` or `.env.test` — conventional and self-documenting
- Do not add `.env.development` or `.env.production` — Next.js auto-load names, reintroduces the problem

## Risks

- External references to `.env.local` outside this repo will break
- Existing devcontainers have old `.bashrc` reference — requires rebuild
- Historical artifacts in `_bmad-output/` reference `.env.local` — do NOT update, they reflect state at time of writing
- WM-2 requires source verification before execution — don't move a variable that app code actually reads
