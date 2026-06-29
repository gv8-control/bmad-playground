#!/bin/bash
docker compose up -d
until curl -sf http://localhost:5678/healthz > /dev/null; do sleep 2; done
n8n import:workflow --separate --input=n8n/workflows --activeState=fromJson
