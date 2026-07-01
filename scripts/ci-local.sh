#!/bin/bash
# Mirror the CI environment locally.
# Run from the project root.
set -euo pipefail

echo "── ci-local: lint ──────────────────────────────────"
yarn nx run-many --target=lint --all --parallel=4

echo "── ci-local: unit & integration tests ──────────────"
CI=true yarn nx run-many --target=test --all --parallel=4 --passWithNoTests

echo "── ci-local: E2E tests ─────────────────────────────"
CI=true yarn playwright test

echo "ci-local: all stages passed"
