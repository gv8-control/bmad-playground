#!/bin/bash
cp --update=none .env.example .env
npm install -g pnpm@10
pnpm install

echo ". .env" > ~/.bashrc
