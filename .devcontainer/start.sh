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

daytona login --api-key "$DAYTONA_API_KEY" >/dev/null 2>&1 || true
