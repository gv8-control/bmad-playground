# BMad Easy

## Dev Services

Start all services:

```sh
docker compose up -d
```

| Service | URL | Credentials |
|---------|-----|-------------|
| Web app | http://localhost:3000 | — |
| n8n | http://localhost:5678 | `dev@dev.dev` / `dev` |
| PostgreSQL | `localhost:5432` | `postgres` / `postgres` |

### n8n credentials

Set these in `.env` and the matching n8n credential is created (or updated) automatically on startup. Credentials whose env vars aren't set are simply skipped, so this is optional.

| Env var | n8n credential |
|---------|----------------|
| `ANTHROPIC_API_KEY` | Anthropic account |
| `MISTRAL_API_KEY` | Mistral Cloud account |

To add more, edit `n8n/credentials.json`.

## CI Test Tiers

| Tier | When | What it does |
|------|------|--------------|
| PR | Every push/PR | Fake-backed functional tests (lint, typecheck, unit, e2e) — fast, free, deterministic |
| Burn-in | PRs + weekly | Same PR suite × 10 iterations — surfaces flaky tests |
| Multi-conn | Nightly | Transport-level scenarios (10 concurrent SSE, back-pressure, outage resilience) — fake-backed |
| Real-service | Nightly | One happy-path agent run against real Daytona + Claude API — catches SDK drift + NFR timing |
| Spike | Weekly | Performance boundary validation (repo-size clone timing) against real Daytona |

### Notifications

This project publishes to [ntfy.sh](https://ntfy.sh) on topic `agent-outcome` to notify you when something needs your input. Subscribe to the topic from any ntfy client to get alerted — the `thejenos.ntfysh-vscode` VS Code extension (already recommended in `.vscode/extensions.json`), the ntfy mobile/desktop app, or a browser tab at https://ntfy.sh/agent-outcome.
