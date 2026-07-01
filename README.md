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

### Notifications

This project publishes to [ntfy.sh](https://ntfy.sh) on topic `agent-outcome` to notify you when something needs your input. Subscribe to the topic from any ntfy client to get alerted — the `thejenos.ntfysh-vscode` VS Code extension (already recommended in `.vscode/extensions.json`), the ntfy mobile/desktop app, or a browser tab at https://ntfy.sh/agent-outcome.
