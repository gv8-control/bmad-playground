#!/bin/bash
cp -n .env.example .env
echo 'set -a; source /workspaces/codespaces-blank/.env; set +a' >> "$HOME/.zshrc"
npm install -g pnpm@10
pnpm install
