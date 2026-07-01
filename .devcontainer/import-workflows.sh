#!/bin/bash

# Import workflows if none exist
SQL_COUNT_WORKFLOWS="SELECT COUNT(*) FROM workflow_entity;"
SQL_FIND_OWNER_ID="SELECT id FROM \"user\" WHERE \"roleSlug\" = 'global:owner' LIMIT 1;"
PSQL="docker compose exec -T -e PGPASSWORD=postgres postgres-n8n psql -U postgres -d n8n -t"

WORKFLOW_COUNT=$($PSQL -c "$SQL_COUNT_WORKFLOWS" | tr -d ' \n')
if [ "${WORKFLOW_COUNT:-0}" = "0" ]; then
  OWNER_ID=$($PSQL -c "$SQL_FIND_OWNER_ID" | tr -d ' \n')
  n8n import:workflow --separate --input=n8n/workflows --activeState=fromJson --userId="$OWNER_ID"
fi
