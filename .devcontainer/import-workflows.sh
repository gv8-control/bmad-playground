#!/bin/bash

# Import workflows if none exist
SQL_COUNT_WORKFLOWS="SELECT COUNT(*) FROM workflow_entity;"
PSQL="docker compose exec -T -e PGPASSWORD=postgres postgres-n8n psql -U postgres -d n8n -t"

WORKFLOW_COUNT=$($PSQL -c "$SQL_COUNT_WORKFLOWS" | tr -d ' \n')
if [ "${WORKFLOW_COUNT:-0}" = "0" ]; then
  n8n import:workflow --separate --input=n8n/workflows --activeState=fromJson

  # import:workflow sets active=true in the DB but does not register webhooks
  # with the running n8n instance. Restart so the startup pass registers them.
  pm2 restart n8n n8n-worker
  until curl -sf http://localhost:5678/healthz > /dev/null 2>&1; do sleep 1; done
fi
