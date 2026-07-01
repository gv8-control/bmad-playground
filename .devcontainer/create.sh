#!/bin/bash
cp --update=none .env.example .env
corepack prepare yarn@stable --activate

yarn install
yarn global add nx pm2 opencode-ai

echo ". .env" > ~/.bashrc
