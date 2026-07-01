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
