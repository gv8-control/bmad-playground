#!/bin/bash
cp --update=none .env.example .env
corepack enable

yarn install
npm install -g nx pm2 opencode-ai

curl -fsSL https://github.com/daytonaio/daytona/releases/latest/download/daytona-linux-amd64 -o /usr/local/bin/daytona
chmod +x /usr/local/bin/daytona

echo "set -a; . .env; [ -f .env.local ] && . .env.local; set +a" > ~/.bashrc
