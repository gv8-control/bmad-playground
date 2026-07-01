#!/bin/bash

# Establish n8n credentials from environment variables. Each entry in
# n8n/credentials.json maps its "data" fields to env var names via "envVars";
# a credential is only imported if all of its mapped env vars are set.
# n8n's import:credentials command encrypts plain "data" objects itself, so no
# shared encryption key is needed.
TEMPLATE=n8n/credentials.json
TMP_CREDENTIALS=$(mktemp)
trap 'rm -f "$TMP_CREDENTIALS"' EXIT

jq '
  map(
    (.envVars // {}) as $envVars
    | ($envVars | to_entries) as $entries
    | ($entries | map(env[.value] // "")) as $values
    | select(($entries | length) > 0 and (all($values[]; . != "")))
    | ( . + { data: ($entries | map({(.key): env[.value]}) | add) } | del(.envVars) )
  )
' "$TEMPLATE" > "$TMP_CREDENTIALS"

CREDENTIAL_COUNT=$(jq 'length' "$TMP_CREDENTIALS")
if [ "$CREDENTIAL_COUNT" != "0" ]; then
  n8n import:credentials --input="$TMP_CREDENTIALS"
fi
