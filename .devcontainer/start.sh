#!/bin/bash

echo "Waiting for Docker..."
until docker info > /dev/null 2>&1; do sleep 1; done
echo "Docker is up"
# Wait for databases
docker compose up -d --wait

set -a; . .env; [ -f .env.local ] && . .env.local; set +a

# Start Tailscale (Workstream G — external accessibility of the dev machine)
if command -v tailscaled &>/dev/null; then
  if ! pgrep -x tailscaled >/dev/null 2>&1; then
    sudo mkdir -p /var/run/tailscale /var/lib/tailscale
    sudo sh -c 'tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock --port=41641 > /tmp/tailscaled.log 2>&1 &'
    sleep 2
  fi
  if [ -n "$TAILSCALE_AUTH_KEY" ]; then
    sudo tailscale up --hostname=bmad-codespace --authkey="$TAILSCALE_AUTH_KEY" --accept-routes=false --accept-dns=true 2>/dev/null \
      && echo "Tailscale: connected" \
      || echo "Tailscale: auth failed — check TAILSCALE_AUTH_KEY in .env.local"
  else
    echo "Tailscale: TAILSCALE_AUTH_KEY not set — run 'sudo tailscale up' manually to join tailnet"
  fi
fi

pm2 start "$(which n8n)" --name n8n 2>/dev/null || true
N8N_RUNNERS_MODE=internal N8N_RUNNERS_ENABLED=true N8N_RUNNERS_BROKER_PORT=5680 pm2 start "$(which n8n)" --name n8n-worker -- worker 2>/dev/null || true

# Wait for n8n to initialize db schema
until curl -sf http://localhost:5678/healthz > /dev/null 2>&1; do sleep 1; done

# Import commands must not run migrations — the main n8n process owns that.
export N8N_RUN_MIGRATIONS=false

.devcontainer/import-workflows.sh
.devcontainer/import-credentials.sh
.devcontainer/setup-n8n-mcp-token.sh

daytona login --api-key "$DAYTONA_API_KEY" >/dev/null 2>&1 || true
