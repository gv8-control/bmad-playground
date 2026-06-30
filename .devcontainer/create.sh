#!/bin/bash
cp --update=none .env.example .env
npm install -g nx opencode-ai
npm install

echo ". .env" > ~/.bashrc
