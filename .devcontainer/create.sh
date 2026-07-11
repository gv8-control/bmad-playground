#!/bin/bash
cp --update=none .env.example .env
corepack enable

yarn install
npm install -g nx pm2 opencode-ai

# Daytona CLI (for Daytona MCP server)
# The public repo is archived at v0.190.0; the binary auto-negotiates with newer APIs.
if ! command -v daytona &>/dev/null; then
  curl -fsSL https://github.com/daytonaio/daytona/releases/latest/download/daytona-linux-amd64 -o /usr/local/bin/daytona
  chmod +x /usr/local/bin/daytona
fi

echo "set -a; . .env; [ -f .env.local ] && . .env.local; set +a" > ~/.bashrc
