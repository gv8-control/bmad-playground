#!/bin/bash
cp --update=none .env.example .env
corepack enable

yarn install
npm install -g nx pm2 opencode-ai

echo "set -a; . .env; set +a" > ~/.bashrc
