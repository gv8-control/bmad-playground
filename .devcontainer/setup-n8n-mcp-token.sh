#!/bin/bash

# Generates an n8n MCP API key and saves it to .env. Skips if the existing
# token still authenticates. Uses rotate (not GET) because GET returns a
# redacted key on subsequent calls.

N8N_BASE="http://localhost:${N8N_PORT:-5678}"

# Skip if existing token still works (401 = invalid, anything else = auth passed)
if [ -n "$N8N_MCP_TOKEN" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${N8N_BASE}/mcp-server/http" \
    -H "Authorization: Bearer ${N8N_MCP_TOKEN}")
  [ "$code" != "401" ] && exit 0
fi

# The MCP server uses Bearer tokens, but key management lives under n8n's
# internal session API (same one the web UI uses), which authenticates via
# cookies — not Bearer tokens. So we log in to get a session cookie.
cookies=$(mktemp)
trap 'rm -f "$cookies"' EXIT

curl -sf -c "$cookies" -X POST "${N8N_BASE}/rest/login" \
  -H "Content-Type: application/json" \
  -d "{\"emailOrLdapLoginId\":\"${N8N_INSTANCE_OWNER_EMAIL}\",\"password\":\"${N8N_INSTANCE_OWNER_PASSWORD}\"}" >/dev/null

token=$(curl -sf -b "$cookies" -X POST "${N8N_BASE}/rest/mcp/api-key/rotate" | jq -r '.data.apiKey // empty')

[ -z "$token" ] && { echo "  n8n MCP token: failed" >&2; exit 1; }

sed -i "s|^N8N_MCP_TOKEN=.*|N8N_MCP_TOKEN=${token}|" .env
export N8N_MCP_TOKEN="$token"
