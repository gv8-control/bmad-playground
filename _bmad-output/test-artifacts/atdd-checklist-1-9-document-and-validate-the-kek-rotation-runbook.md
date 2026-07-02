---
stepsCompleted:
  - 'step-01-preflight-and-context'
  - 'step-02-generation-mode'
  - 'step-03-test-strategy'
  - 'step-04-generate-tests'
  - 'step-04c-aggregate'
  - 'step-05-validate-and-complete'
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-07-02'
storyId: '1.9'
storyKey: '1-9-document-and-validate-the-kek-rotation-runbook'
storyFile: '_bmad-output/implementation-artifacts/1-9-document-and-validate-the-kek-rotation-runbook.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-1-9-document-and-validate-the-kek-rotation-runbook.md'
generatedTestFiles:
  - 'apps/web/src/lib/crypto.test.ts (Story 1.9 describe blocks appended)'
inputDocuments:
  - '_bmad/tea/config.yaml'
  - '_bmad-output/implementation-artifacts/1-9-document-and-validate-the-kek-rotation-runbook.md'
  - 'apps/web/src/lib/crypto.ts'
  - 'apps/web/src/lib/crypto.test.ts'
  - 'libs/database-schemas/src/prisma/schema.prisma'
---

# ATDD Checklist — Story 1.9: Document and Validate the KEK Rotation Runbook

**Date:** 2026-07-02
**Author:** Master Test Architect (TEA bmad-testarch-atdd)
**TDD Phase:** 🔴 RED — scaffolds generated, awaiting implementation

## Stack & Mode

- Detected stack: fullstack; this story has **no UI surface** → unit-level acceptance tests only.
- Generation mode: AI generation (clear ACs; nothing to record in a browser).
- Execution mode: sequential (worker B / E2E is empty for this story — recorded deviation, see below).

## Test Strategy (AC → level → priority)

| AC | Scenario | Level | Priority | Automated? |
|---|---|---|---|---|
| AC-2 | Rewrapped credential decrypts under new KEK (round-trip) | Unit | P0 | Yes — red scaffold |
| AC-2 | Rewrap preserves DEK bytes exactly | Unit | P0 | Yes — red scaffold |
| AC-2 | Rewrap uses fresh `dekNonce`; token fields untouched (GCM nonce-uniqueness invariant) | Unit | P0 | Yes — red scaffold |
| AC-2 | Wrong old KEK → GCM auth failure throws (no silent corruption) | Unit | P0 | Yes — red scaffold |
| AC-2 | Malformed `encryptedDek` rejected | Unit | P1 | Yes — red scaffold |
| AC-2 | Double rotation A→B→C stays decryptable (re-run safety) | Unit | P1 | Yes — red scaffold |
| AC-2 | `parseKekHex` validation (valid/short/non-hex/empty) | Unit | P1 | Yes — red scaffolds (4) |
| AC-2 | Full rotation against a real non-production database (seed → dry-run → rotate → verify → decrypt check; idempotent re-run; both-KEKs-fail row) | Integration (operational) | P0 | Runbook execution per story Task 4 — evidence recorded in the runbook's Validation record; intentionally NOT a CI jest test (needs live Postgres + env orchestration) |
| AC-1 | Runbook documents introduce/re-wrap/retire steps with no plaintext token exposure | Documentation | P0 | Manual — verified by code review / acceptance audit |
| AC-3 | Runbook committed at `docs/runbooks/kek-rotation.md` | Documentation | P1 | Manual — file presence verified at review |

## Red-Phase Scaffolds

**File:** `apps/web/src/lib/crypto.test.ts` — two new describe blocks appended, following the file's existing Story 1.3 ATDD conventions (env-var KEK in `beforeEach`/`afterEach`, `[P0]`/`[P1]` tags, BDD-style names):

- `unwrapDek / rewrapDek — KEK rotation (Story 1.9, AC-2)` — 6 tests, all `test.skip()`
- `parseKekHex — KEK input validation (Story 1.9)` — 4 tests, all `test.skip()`

**Red signal:** the named imports `unwrapDek`, `rewrapDek`, `parseKekHex` do not exist in `crypto.ts` yet (TS2305 until Task 1 lands — same pattern the Story 1.3 red phase used). Suite verified: `10 skipped, 9 passed` — existing Story 1.3 coverage untouched.

**Activation instructions for the dev agent:** implement `unwrapDek` → `rewrapDek` → `parseKekHex` (story Task 1), removing `test.skip()` one test at a time; all 10 must pass un-skipped before Task 2 (rotation script) begins. The script itself is validated by the story Task 4 runbook execution, not by jest.

## E2E Tests

None. No UI surface exists or is added by this story; Playwright coverage is explicitly not applicable (story Dev Notes state this). Worker B (E2E generation) produced an intentionally empty set.

## Deviations from Standard ATDD Flow

- Sequential execution instead of parallel subagents: the E2E worker had no work, and the API/unit worker's output is a single small describe pair fully specified by the strategy. Output contracts (scaffolds + this checklist) are unchanged.
- Red-phase signal uses missing named exports (repo's established Story 1.3 pattern) in addition to `test.skip()` — `tsc --noEmit` will show TS2305 on `crypto.test.ts` until story Task 1 is implemented. Jest remains green (skips) so unrelated CI runs are not broken.
