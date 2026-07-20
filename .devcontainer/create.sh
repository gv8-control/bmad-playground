#!/bin/bash
cp --update=none .env.example .env

corepack enable
corepack prepare yarn@4.17.0 --activate

YARN_ENABLE_TELEMETRY=0 yarn install
npm install -g nx pm2 opencode-ai @playwright/cli@latest n8n@2.26.8
playwright-cli install --skills
npx playwright install chrome

sudo curl -fsSL https://github.com/daytonaio/daytona/releases/latest/download/daytona-linux-amd64 -o /usr/local/bin/daytona
sudo chmod +x /usr/local/bin/daytona

curl -fsSL https://tailscale.com/install.sh | sh

scripts/download-sandbox-agent.sh || echo "sandbox-agent: download failed — sandbox provisioning will not work until scripts/download-sandbox-agent.sh succeeds"
# Authenticate Daytona CLI (for MCP server) — key comes from .env
set -a; . .env; [ -f .env.local ] && . .env.local; set +a
if [ -n "$DAYTONA_API_KEY" ]; then
  daytona login --api-key "$DAYTONA_API_KEY" >/dev/null 2>&1
  # daytona login exits 1 on a "profile with id env not found" quirk even on
  # success, so verify with daytona list instead.
  daytona list >/dev/null 2>&1 \
    && echo "Daytona: authenticated" \
    || echo "Daytona: login failed — check DAYTONA_API_KEY in .env"
else
  echo "Daytona: DAYTONA_API_KEY not set — MCP server will not work until 'daytona login' is run"
fi

echo "set -a; . .env; [ -f .env.local ] && . .env.local; set +a" > ~/.bashrc
