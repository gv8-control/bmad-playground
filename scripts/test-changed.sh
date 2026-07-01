#!/bin/bash
# Run tests only for projects affected by changes since the base branch.
# Usage: ./scripts/test-changed.sh [base-ref]
# Example: ./scripts/test-changed.sh main
set -euo pipefail

BASE_REF="${1:-main}"

echo "── test-changed: affected since $BASE_REF ──────────"
yarn nx affected --target=lint --base="$BASE_REF"
yarn nx affected --target=test --base="$BASE_REF" --passWithNoTests
CI=true yarn nx affected --target=e2e --base="$BASE_REF" --passWithNoTests

echo "test-changed: done"
