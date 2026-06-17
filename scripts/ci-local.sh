#!/bin/bash
# Mirror the CI environment locally.
# Run from the project root.
set -euo pipefail

echo "── ci-local: lint ──────────────────────────────────"
pnpm exec nx run-many --target=lint --all --parallel=4

echo "── ci-local: unit & integration tests ──────────────"
CI=true pnpm exec nx run-many --target=test --all --parallel=4 --passWithNoTests

echo "── ci-local: E2E tests ─────────────────────────────"
CI=true pnpm exec playwright test

echo "ci-local: all stages passed"
