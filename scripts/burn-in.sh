#!/bin/bash
# Run the Playwright burn-in loop locally to detect flaky tests.
# Usage: ./scripts/burn-in.sh [iterations]
# Example: ./scripts/burn-in.sh 10
set -euo pipefail

COUNT="${1:-10}"

echo "Starting burn-in loop ($COUNT iterations)"
for i in $(seq 1 "$COUNT"); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Burn-in iteration $i/$COUNT"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  CI=true pnpm exec playwright test || exit 1
done

echo "Burn-in complete — no flaky tests detected"
