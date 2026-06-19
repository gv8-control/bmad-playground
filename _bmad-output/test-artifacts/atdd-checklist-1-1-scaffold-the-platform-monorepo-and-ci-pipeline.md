---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-05-activate
lastStep: step-05-activate
lastSaved: '2026-06-19'
storyId: '1.1'
storyKey: 1-1-scaffold-the-platform-monorepo-and-ci-pipeline
storyFile: _bmad-output/implementation-artifacts/1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md
generatedTestFiles: []
---

# ATDD Checklist — Story 1.1: Scaffold the Platform Monorepo and CI Pipeline

**TDD Phase:** N/A (Infrastructure story — no user-facing acceptance tests generated)
**Stack:** fullstack (Next.js + NestJS)
**Generated:** 2026-06-19
**Execution Mode:** SEQUENTIAL

---

## Assessment: Why No ATDD Test Scaffolds Were Generated

Story 1.1 is a **pure infrastructure story**. Its four acceptance criteria describe build-system and tooling outcomes, not observable user behaviours:

| AC | Description | Verification method |
|---|---|---|
| AC-1 | All apps and libs build via `nx build` | Build command output — not a test |
| AC-2 | Prisma schema generates a client importable by both apps | `prisma generate` + TypeScript compilation |
| AC-3 | DESIGN.md tokens applied as Tailwind theme, dark-mode only | Tailwind output inspection / visual review |
| AC-4 | GitHub Actions CI runs lint and test suites as merge gate | CI pipeline run — not a unit/E2E test |

Generating acceptance tests for these ACs would mean testing the test infrastructure itself, which is circular and provides no meaningful signal over running the build commands directly.

---

## Existing Test Coverage (Activated)

Story 1.1 delivered and activated the following tests that verify the scaffold is correctly wired:

| File | Framework | Tests | Status |
|---|---|---|---|
| `apps/agent-be/src/app/app.controller.spec.ts` | Jest (unit) | 1 | Passing |
| `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` | Jest (integration) | 6 | Passing |
| `libs/shared-types/src/lib/shared-types.spec.ts` | Jest (unit) | 0 (placeholder) | — |
| `libs/database-schemas/src/lib/database-schemas.spec.ts` | Jest (unit) | 0 (placeholder) | — |

These tests confirm:
- NestJS app module and controller wire up correctly (AC-1)
- `ISandboxService` interface and `SandboxServiceFake` satisfy the B-01 contract (AC-2 dependency)
- `@bmad-easy/shared-types` path mapping resolves correctly in both app and test contexts (AC-1)

---

## Build Verification Commands (Replaces ATDD for Infrastructure ACs)

```bash
# AC-1: All projects build
pnpm exec nx run-many --target=build --all

# AC-2: Prisma client generates
pnpm exec nx run database-schemas:generate

# AC-3: Tailwind tokens (visual — no automated test)
pnpm exec nx build web  # Next.js build includes Tailwind compilation

# AC-4: Lint and test suites pass (CI gate verification locally)
pnpm exec nx run-many --target=lint --all --parallel=4
pnpm exec nx run-many --target=test --all --parallel=4 --passWithNoTests
```

---

## Note on ATDD Coverage Gap

Story 1.1's infrastructure ACs are intentionally not covered by ATDD. Any regressions are detected by:
- `nx build` failures in CI
- Lint failures in CI
- Downstream stories' test suites (stories 1.2+ assume the scaffold is correct)

This is consistent with industry practice: infrastructure scaffolding verification belongs in build pipelines, not in acceptance test suites.
