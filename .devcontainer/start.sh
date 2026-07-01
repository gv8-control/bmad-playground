#!/bin/bash

echo "Waiting for Docker..."
until docker info > /dev/null 2>&1; do sleep 1; done
echo "Docker is up"
docker compose up -d --wait

pm2 start "$(which n8n)" --name n8n 2>/dev/null || true

# Wait until n8n is up (n8n also initializes DB schema during startup)
until curl -sf http://localhost:5678/healthz > /dev/null 2>&1; do sleep 1; done

.devcontainer/import-workflows.sh
