#!/usr/bin/env bash
#
# Downloads the pinned sandbox-agent binary to /opt/sandbox-agent (or a custom
# path passed as $1) and verifies its sha256 checksum.
#
# SOURCE OF TRUTH: apps/agent-be/Dockerfile (the sandbox-agent build stage).
# If the version or checksum below drift from the Dockerfile ARGs, update both.
# The Dockerfile is authoritative — this script mirrors it for local dev only.
#
# Usage:
#   scripts/download-sandbox-agent.sh              # -> /opt/sandbox-agent (may need sudo)
#   scripts/download-sandbox-agent.sh ./local-bin  # -> custom path
#
set -euo pipefail

# Pinned to match apps/agent-be/Dockerfile ARGs exactly.
SANDBOX_AGENT_VERSION="0.4.2"
SANDBOX_AGENT_SHA256="bab098abef874ade481aa7b50463662814fbf27294399f545307fedb638f029b"

OUTPUT_PATH="${1:-/opt/sandbox-agent}"
URL="https://releases.rivet.dev/sandbox-agent/${SANDBOX_AGENT_VERSION}/binaries/sandbox-agent-x86_64-unknown-linux-musl"

echo "Downloading sandbox-agent v${SANDBOX_AGENT_VERSION}"
echo "  from: ${URL}"
echo "  to:   ${OUTPUT_PATH}"

# Ensure the target directory is writable (sudo if needed for /opt).
PARENT_DIR="$(dirname "${OUTPUT_PATH}")"
if [ ! -w "${PARENT_DIR}" ]; then
  echo "Target directory ${PARENT_DIR} is not writable — retrying with sudo."
  SUDO="sudo"
else
  SUDO=""
fi

# Download to a temp file in the same directory (atomic move on success).
TMP_FILE="$(mktemp "${OUTPUT_PATH}.XXXXXX")"
trap 'rm -f "${TMP_FILE}"' EXIT

curl -fsSL --max-time 120 --retry 3 "${URL}" -o "${TMP_FILE}"

# Verify checksum — fail loudly on mismatch (matches Dockerfile discipline).
ACTUAL_SHA="$(sha256sum "${TMP_FILE}" | awk '{print $1}')"
if [ "${ACTUAL_SHA}" != "${SANDBOX_AGENT_SHA256}" ]; then
  echo "ERROR: sha256 checksum mismatch" >&2
  echo "  expected: ${SANDBOX_AGENT_SHA256}" >&2
  echo "  actual:   ${ACTUAL_SHA}" >&2
  exit 1
fi
echo "Checksum verified."

${SUDO} mv "${TMP_FILE}" "${OUTPUT_PATH}"
${SUDO} chmod +x "${OUTPUT_PATH}"

echo "Done. sandbox-agent installed at ${OUTPUT_PATH}"
echo "If not at /opt/sandbox-agent, set SANDBOX_AGENT_PATH=${OUTPUT_PATH} in your .env.local"
