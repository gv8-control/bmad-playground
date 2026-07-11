#!/bin/bash
cp --update=none .env.example .env

# n8n loads external hooks via require(), which needs an absolute path.
# Compute it here so it's baked into .env and available in every shell
# that sources it (start.sh, .bashrc, manual pm2 commands).
sed -i "s|EXTERNAL_HOOK_FILES=.*|EXTERNAL_HOOK_FILES=$PWD/n8n/hooks.js|" .env

corepack enable

yarn install
npm install -g nx pm2 opencode-ai @playwright/cli@latest n8n@2.26.8
playwright-cli install --skills
npx playwright install chrome

curl -fsSL https://github.com/daytonaio/daytona/releases/latest/download/daytona-linux-amd64 -o /usr/local/bin/daytona
chmod +x /usr/local/bin/daytona

echo "set -a; . .env; [ -f .env.local ] && . .env.local; set +a" > ~/.bashrc
