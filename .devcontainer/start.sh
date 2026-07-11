#!/bin/bash

echo "Waiting for Docker..."
until docker info > /dev/null 2>&1; do sleep 1; done
echo "Docker is up"
# Wait for databases
docker compose up -d --wait

set -a; . .env; set +a
pm2 start "$(which n8n)" --name n8n 2>/dev/null || true
N8N_RUNNERS_MODE=internal N8N_RUNNERS_ENABLED=true N8N_RUNNERS_BROKER_PORT=5680 pm2 start "$(which n8n)" --name n8n-worker -- worker 2>/dev/null || true

# Wait for n8n to initialize db schema
until curl -sf http://localhost:5678/healthz > /dev/null 2>&1; do sleep 1; done

.devcontainer/import-workflows.sh
.devcontainer/import-credentials.sh

# Daytona CLI auth (for Daytona MCP server)
# Idempotent: re-login each start so credentials stay fresh.
# Note: `daytona login` exits non-zero on CLI v0.190.0 (last public release)
# due to a profile lookup warning, but the API key is set successfully.
# We verify auth with `daytona list` instead of relying on the login exit code.
if [ -n "$DAYTONA_API_KEY" ]; then
  daytona login --api-key "$DAYTONA_API_KEY" >/dev/null 2>&1 || true
  if daytona list >/dev/null 2>&1; then
    echo "Daytona: authenticated"
  else
    echo "Daytona: authentication failed — check DAYTONA_API_KEY"
  fi
fi
