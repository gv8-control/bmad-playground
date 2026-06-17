---
status: ready-for-dev
---

# Story 1.1: Scaffold the Platform Monorepo and CI Pipeline

Status: ready-for-dev

## Story

As a developer on the bmad-easy team,
I want the Nx monorepo scaffolded with the web and agent-be apps, shared libs, design tokens, and a CI pipeline,
so that every subsequent feature has a consistent, deployable foundation to build on.

## Acceptance Criteria

**AC-1:** `apps/web` (Next.js 15, App Router, Tailwind, TypeScript strict), `apps/agent-be` (NestJS), `libs/shared-types`, and `libs/database-schemas` all exist and build successfully via `nx build`.

**AC-2:** `libs/database-schemas` contains the initial Prisma schema (User model at minimum) and generates a Prisma client that can be imported by both apps against a single Railway Postgres instance.

**AC-3:** The DESIGN.md color/typography/spacing/radius tokens are applied as the Tailwind theme in `apps/web` (UX-DR1), with no light-mode variant — dark mode only.

**AC-4:** GitHub Actions CI (`.github/workflows/test.yml`) runs lint and all available test suites (unit/integration/E2E) as a merge gate on push/PR to `main`/`develop`. Deploy for both Vercel (`apps/web`) and Railway (`apps/agent-be`) is a manual trigger, not automatic on merge.

## Tasks / Subtasks

- [ ] Task 1: Initialize the Nx workspace in-place (AC: 1)
  - [ ] 1.1 Run workspace init command adapted for in-repo use (see Dev Notes)
  - [ ] 1.2 Generate `apps/web`: `nx generate @nx/next:app apps/web --style=none --appDir --src --e2eTestRunner=none`
  - [ ] 1.3 Generate `apps/agent-be`: `nx generate @nx/nest:app apps/agent-be --e2eTestRunner=none` (the `--e2eTestRunner=none` flag is critical — it prevents Nx from creating a conflicting `test/` directory alongside the pre-existing test files)
  - [ ] 1.4 Generate `libs/shared-types`: `nx generate @nx/js:lib shared-types --directory=libs --importPath=@bmad-easy/shared-types --bundler=none`
  - [ ] 1.5 Generate `libs/database-schemas`: `nx generate @nx/js:lib database-schemas --directory=libs --importPath=@bmad-easy/database-schemas --bundler=none`
  - [ ] 1.6 Set TypeScript strict mode in all tsconfigs
  - [ ] 1.7 Verify `nx build` succeeds for all apps and libs

- [ ] Task 2: Create `libs/shared-types` content (AC: 1)
  - [ ] 2.1 Create `sandbox.interface.ts` with ISandboxService and related types per architecture B-01 spec
  - [ ] 2.2 Create `SANDBOX_SERVICE` DI token constant in `sandbox.constants.ts` (note: placed in `libs/shared-types` so both app and test can import it without a circular dependency; `apps/agent-be/src/sandbox/sandbox.constants.ts` re-exports it)
  - [ ] 2.3 Create stub type files: `ag-ui.types.ts`, `conversation.types.ts`, `artifact.types.ts`, `credential-health.types.ts`
  - [ ] 2.4 Export everything from `src/index.ts`
  - [ ] 2.5 Update pre-existing `apps/agent-be/test/helpers/sandbox-service.fake.ts` to implement all ISandboxService methods (add stubs for methods not yet used by tests)
  - [ ] 2.6 Confirm `apps/agent-be/test/helpers/test-module-builder.ts` imports compile correctly

- [ ] Task 3: Configure `libs/database-schemas` with Prisma (AC: 2)
  - [ ] 3.1 Install `prisma@^7.8.0` and `@prisma/client@^7.8.0` in `libs/database-schemas`
  - [ ] 3.2 Create `src/prisma/schema.prisma` with User model (id, email, name, githubLogin, githubId, active, createdAt, updatedAt) following `@@map("users")` snake_case convention
  - [ ] 3.3 Create `src/index.ts` exporting a Prisma client factory function
  - [ ] 3.4 Run `prisma generate` to confirm client generation succeeds
  - [ ] 3.5 Verify `@bmad-easy/database-schemas` path mapping in `tsconfig.base.json` resolves correctly
  - [ ] 3.6 Add `@prisma/client@^7.8.0` to `apps/web/package.json` and `apps/agent-be/package.json`

- [ ] Task 4: Configure Tailwind with DESIGN.md tokens in `apps/web` (AC: 3)
  - [ ] 4.1 Set `darkMode: 'class'` but add `html` class `dark` globally — effectively forces dark mode for MVP
  - [ ] 4.2 Define color tokens from DESIGN.md in `tailwind.config.ts` theme extension
  - [ ] 4.3 Define typography scale (xs, sm, base, lg, xl, 2xl) from DESIGN.md
  - [ ] 4.4 Define border-radius tokens (sm, md, lg, xl, 2xl, full) from DESIGN.md
  - [ ] 4.5 Reference Inter and JetBrains Mono font families in theme
  - [ ] 4.6 Verify no light-mode variants exist in the theme

- [ ] Task 5: Integrate pre-existing test and CI infrastructure (AC: 4)
  - [ ] 5.1 Create `apps/agent-be/src/sandbox/sandbox.constants.ts` re-exporting `SANDBOX_SERVICE` so the existing test-module-builder import path resolves
  - [ ] 5.2 Run integration tests in `apps/agent-be/test/` to confirm they pass with the new shared-types (run after Tasks 1–4 are complete)
  - [ ] 5.3 Activate `.github/workflows/test.yml`: remove all `[BLUEPRINT]` comment markers; the lint and unit/integration test steps are now active
  - [ ] 5.4 Leave `playwright.config.ts` `webServer` block commented — `apps/agent-be` has no `/health` endpoint yet (delivered in a later story); E2E tests use `BASE_URL` env var against a manually-started server
  - [ ] 5.5 Verify lint passes: `pnpm exec nx run-many --target=lint --all --parallel=4`
  - [ ] 5.6 Verify unit/integration tests pass: `pnpm exec nx run-many --target=test --all --parallel=4 --passWithNoTests`

## Dev Notes

### Critical: Workspace Initialization in an Existing Repo

The architecture's initialization commands use `npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=pnpm`, which would create a `bmad-easy/` **subdirectory**. Our repository root IS the workspace root, so the command must be adapted:

```bash
# Run from /workspaces/codespaces-blank (the repo root)
npx create-nx-workspace@latest . --preset=empty --packageManager=pnpm --name=bmad-easy --nxCloud=skip
```

The `.` target initializes the current directory. Accept the "directory is not empty" prompt. This creates `package.json`, `nx.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` in the repo root.

Alternatively if the interactive prompt is problematic, use:
```bash
npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=pnpm --nxCloud=skip
# then move the contents of bmad-easy/ into the repo root
```

Node version: 24 (`.nvmrc`). pnpm version: 9 (from CI workflow).

### Pre-Existing Files to Integrate

The following files already exist as untracked working-tree artifacts and must be incorporated — do NOT recreate them:

| File | Status | Action |
|------|--------|--------|
| `apps/agent-be/test/helpers/sandbox-service.fake.ts` | Untracked | Keep; update to implement full ISandboxService |
| `apps/agent-be/test/helpers/test-module-builder.ts` | Untracked | Keep; verify imports compile |
| `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` | Untracked | Keep as-is |
| `apps/agent-be/test/jest-integration.config.ts` | Untracked | Keep as-is |
| `.github/workflows/test.yml` | Committed (BLUEPRINT MODE) | Activate — see Task 5.3 |
| `.github/workflows/claude-code-review.yml` | Committed | Leave unchanged |
| `.github/workflows/claude.yml` | Committed | Leave unchanged |
| `playwright/` | Committed | Leave as-is |
| `playwright.config.ts` | Committed | Leave as-is — `webServer` block stays commented (no `/health` endpoint yet) |
| `.env.example` | Untracked | Leave as-is (already complete) |
| `.nvmrc` | Untracked | Leave as-is |
| `scripts/` | Committed | Leave as-is |

### ISandboxService Interface — Reconciliation Required

The pre-existing `sandbox-service.fake.ts` uses `SandboxProvisionOptions` and `SandboxInfo` types imported from `@bmad-easy/shared-types`. The architecture's B-01 spec uses `ProvisionParams`. These must be reconciled when authoring `libs/shared-types/src/sandbox.interface.ts`.

**Define the interface to match the architecture spec exactly**, then update the fake to use the same type names:

```typescript
// libs/shared-types/src/sandbox.interface.ts

export interface ProvisionParams {
  conversationId: string;
  repoUrl: string;
  credential: string;   // the OAuth access token for git transport
}

export interface SandboxInfo {
  sandboxId: string;
  conversationId: string;
  status: 'running' | 'stopped' | 'ready';
  provisionedAt?: Date;
}

export interface GitUserConfig {
  name: string;
  email: string;
}

export interface WorkingTreeStatus {
  dirty: boolean;
  files: string[];
}

export interface ISandboxService {
  provision(params: ProvisionParams): Promise<SandboxInfo>;
  clone(sandboxId: string, repoUrl: string, credential: string): Promise<void>;
  resume(sandboxId: string): Promise<SandboxInfo>;
  destroy(sandboxId: string): Promise<void>;
  injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void>;
  getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus>;
  terminateProcess(sandboxId: string, processId: string): Promise<void>;
}

export const SANDBOX_SERVICE = Symbol('ISandboxService');
```

**Update `sandbox-service.fake.ts`** to use `ProvisionParams` (not `SandboxProvisionOptions`) and implement all ISandboxService methods. The existing test assertions check `sandbox.status === 'ready'` and `sandbox.conversationId` — keep those fields in `SandboxInfo`.

**⚠️ Critical rename — update the integration test too:** The proposed `SandboxInfo` uses `sandboxId` (not `id`). The test at `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` calls `sandboxFake.destroy(sandbox.id)` — after the rename, `sandbox.id` is `undefined` and the destroy call silently no-ops, causing the `activeSandboxCount()` assertion to fail. Change that line to `sandboxFake.destroy(sandbox.sandboxId)` when updating the fake.

Also update the fake's internal map key from `sandbox.id` to `sandbox.sandboxId` in the `provision()` implementation.

**`getStatus()` and `executeCommand()`** already on the fake are NOT in ISandboxService — leave them as extra helper methods on the fake class (they don't interfere).

**Stubs for new ISandboxService methods:**

```typescript
async clone(sandboxId: string, repoUrl: string, credential: string): Promise<void> {
  if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
}

async resume(sandboxId: string): Promise<SandboxInfo> {
  const sandbox = this.sandboxes.get(sandboxId);
  if (!sandbox) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
  return { ...sandbox, status: 'ready' };
}

async injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void> {
  if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
}

async getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus> {
  if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
  return { dirty: false, files: [] };
}

async terminateProcess(sandboxId: string, processId: string): Promise<void> {
  if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
}
```

The `test-module-builder.ts` imports `SANDBOX_SERVICE` from `'../../src/sandbox/sandbox.constants'`. Create `apps/agent-be/src/sandbox/sandbox.constants.ts`:
```typescript
export { SANDBOX_SERVICE } from '@bmad-easy/shared-types';
```
This re-export keeps the import path the test expects while the canonical symbol lives in shared-types.

### Architecture Patterns — Naming Conventions

Follow these exactly; the linter/code-review enforces them:

- **Prisma models:** PascalCase singular (`User`), `@@map("users")` snake_case table, `@map("snake_case")` column
- **Component files:** PascalCase (`ConversationPane.tsx`)
- **Non-component files:** kebab-case (`sandbox.service.ts`, `sandbox.constants.ts`)
- **Functions/variables:** camelCase; Classes/types/interfaces: PascalCase
- **Tests:** co-located with source (`*.spec.ts` / `*.test.tsx`) — NOT in a separate `__tests__/` tree
- **Validation:** Zod everywhere; never `class-validator`/`class-transformer`
- **API error envelope:** `{ code, message, meta }` on all `apps/agent-be` errors

### Prisma User Model

Minimum schema for this story. Future stories add more models (Conversation, RepoConnection, etc.).

```prisma
// libs/database-schemas/src/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  githubId     String   @unique @map("github_id")
  githubLogin  String   @unique @map("github_login")
  name         String?
  email        String?
  active       Boolean  @default(true)
  lastActiveAt DateTime? @map("last_active_at")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```

Export the Prisma client from `libs/database-schemas/src/index.ts`:
```typescript
export { PrismaClient } from './generated/client';
export * from './generated/client';
```

Add `generated/` to `.gitignore` — it is a build artifact, not source.

### Tailwind Design Tokens (UX-DR1)

All values come from `DESIGN.md`. Map them to Tailwind CSS variables in `tailwind.config.ts`:

```typescript
// apps/web/tailwind.config.ts (excerpt)
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:             '#0D0D11',
        surface:        '#16161C',
        'surface-raised':'#1E1E26',
        border:         '#2B2B38',
        'border-subtle':'#1E1E26',
        'text-1':       '#EDECF5',
        'text-2':       '#8D8CA0',
        'text-3':       '#56556A',
        accent:         '#7B6EE8',
        'accent-hover': '#9083F2',
        'accent-fg':    '#FFFFFF',
        positive:       '#3ECF8E',
        'positive-bg':  'rgba(62,207,142,0.08)',
        caution:        '#F2A944',
        'caution-bg':   'rgba(242,169,68,0.08)',
        negative:       '#F06B6B',
        'negative-bg':  'rgba(240,107,107,0.08)',
        overlay:        'rgba(0,0,0,0.65)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Mono', 'monospace'],
      },
      fontSize: {
        xs:   ['0.75rem',  { lineHeight: '1rem' }],
        sm:   ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem',     { lineHeight: '1.5rem' }],
        lg:   ['1.125rem', { lineHeight: '1.75rem' }],
        xl:   ['1.25rem',  { lineHeight: '1.75rem' }],
        '2xl':['1.5rem',   { lineHeight: '2rem' }],
      },
      borderRadius: {
        sm:   '4px',
        md:   '8px',
        lg:   '12px',
        xl:   '16px',
        '2xl':'24px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};

export default config;
```

Add `<html class="dark">` to `apps/web/src/app/layout.tsx` — forces dark mode globally with no toggle.

### shadcn/ui Init Prompt Answers

Run `pnpm dlx shadcn@latest init` from `apps/web`. Use these answers:

| Prompt | Answer |
|--------|--------|
| Style | New York |
| Base color | Neutral (overridden by DESIGN.md tokens — choice doesn't matter) |
| CSS variables for colors? | Yes |

After init, shadcn writes a `tailwind.config.ts` with its own color variables. **Override the entire `theme.extend` block** with the DESIGN.md tokens from Task 4 — the shadcn defaults are irrelevant given the custom dark-only palette.

### CI Pipeline Activation (Task 5.3)

The `.github/workflows/test.yml` is in "BLUEPRINT MODE". Remove the `[BLUEPRINT]` comment markers from:
1. The `lint` job's `Lint all apps and libs` step
2. The `unit` job's `Run unit and integration tests` step

The E2E and burn-in `[BLUEPRINT]` sections (the webServer start blocks) in `test.yml` remain commented until the apps have working health endpoints (a later story). Do NOT uncomment `Start web app` / `Start agent-be` in the CI workflow yet — keep those `# [BLUEPRINT]` comment blocks.

For `playwright.config.ts`: the `webServer` block is already commented and must remain commented — do NOT uncomment it. Local E2E dev uses `BASE_URL` against a manually-started server. The `webServer` integration requires `apps/agent-be` to expose a `/health` endpoint which is a later story deliverable. (This also explains why Task 5.4 says to leave it commented, not uncomment it.)

### Packages to Install for THIS Story Only

Do NOT install future-story packages (`next-auth`, `@assistant-ui/*`, `@ag-ui/*`, `@anthropic-ai/claude-agent-sdk`, `@daytonaio/sdk`, `nestjs-zod`, `@nestjs/throttler`) in this story — they are scope creep. Install only:

| Package | Where | Story 1.1 reason |
|---------|-------|-----------------|
| `prisma@^7.8.0` | `libs/database-schemas` | Schema + migration tooling |
| `@prisma/client@^7.8.0` | `libs/database-schemas`, `apps/web`, `apps/agent-be` | Generated client import |
| `shadcn/ui` init | `apps/web` | Radix + Tailwind component library (run `pnpm dlx shadcn@latest init` — see prompt answers below) |
| `zod@^4.4.3` | `apps/web`, `apps/agent-be` | Needed for AC validation even at scaffold stage |

### Architecture: Nx `tsconfig.base.json` Path Mappings

The Nx generators create these automatically, but verify after generation:

```json
{
  "compilerOptions": {
    "paths": {
      "@bmad-easy/shared-types": ["libs/shared-types/src/index.ts"],
      "@bmad-easy/shared-types/*": ["libs/shared-types/src/*"],
      "@bmad-easy/database-schemas": ["libs/database-schemas/src/index.ts"],
      "@bmad-easy/database-schemas/*": ["libs/database-schemas/src/*"]
    }
  }
}
```

These paths are also needed in `apps/agent-be/test/jest-integration.config.ts` (already present as `moduleNameMapper` entries — verify they match the generated paths).

### Build Verification

After all tasks, confirm:
```bash
pnpm exec nx build web          # Next.js production build succeeds
pnpm exec nx build agent-be     # NestJS build succeeds
pnpm exec nx run database-schemas:generate  # Prisma client generates
pnpm exec nx run-many --target=lint --all   # No lint errors
pnpm exec nx run-many --target=test --all --passWithNoTests  # Tests pass
```

The integration tests in `apps/agent-be/test/` use `jest-integration.config.ts` — check if the NestJS app project config exposes an integration test target, or run directly: `cd apps/agent-be && pnpm exec jest --config test/jest-integration.config.ts`.

### Project Structure Alignment

The generated structure must match the architecture's directory tree. Key paths to verify after generation:

```
apps/web/src/app/layout.tsx          ← add <html class="dark">
apps/web/src/app/page.tsx            ← placeholder redirect
apps/web/tailwind.config.ts          ← DESIGN.md tokens (Task 4)
apps/web/src/lib/                    ← created empty for future stories
apps/agent-be/src/main.ts            ← NestJS bootstrap
apps/agent-be/src/app.module.ts      ← root module
apps/agent-be/src/sandbox/sandbox.constants.ts  ← re-exports SANDBOX_SERVICE (Task 5.1)
libs/shared-types/src/index.ts       ← exports all types
libs/shared-types/src/sandbox.interface.ts      ← ISandboxService (Task 2.1)
libs/database-schemas/src/index.ts   ← Prisma client factory
libs/database-schemas/src/prisma/schema.prisma  ← User model (Task 3.2)
```

### References

- [Architecture: Initialization Commands](../_bmad-output/planning-artifacts/architecture.md#initialization-commands)
- [Architecture: ISandboxService B-01 Contract](../_bmad-output/planning-artifacts/architecture.md#isandboxservice-contract-b-01-test-seam)
- [Architecture: Key Packages Added Post-Scaffold](../_bmad-output/planning-artifacts/architecture.md#key-packages-added-post-scaffold)
- [Architecture: Complete Project Directory Structure](../_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure)
- [Architecture: Naming Patterns](../_bmad-output/planning-artifacts/architecture.md#naming-patterns)
- [Architecture: Data Architecture / Prisma conventions](../_bmad-output/planning-artifacts/architecture.md#data-architecture)
- [DESIGN.md: Colors, Typography, Spacing, Shapes](../_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md)
- [Epics: Story 1.1 ACs](../_bmad-output/planning-artifacts/epics.md#story-11-scaffold-the-platform-monorepo-and-ci-pipeline)
- [Epics: Additional Requirements (Nx/pnpm scaffold, shadcn/ui)](../_bmad-output/planning-artifacts/epics.md#additional-requirements)
- [CI Workflow: .github/workflows/test.yml](../../.github/workflows/test.yml)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List

### Change Log

- 2026-06-17: Story created by create-story workflow
- 2026-06-17: Story validated by create-story checklist — fixed Task 5.4 contradiction, added Nx generator flags, added SandboxInfo.id→sandboxId test update warning, added ISandboxService fake stubs, added shadcn/ui init answers
