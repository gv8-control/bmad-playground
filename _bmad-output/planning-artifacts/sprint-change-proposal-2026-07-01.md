---
title: "Sprint Change Proposal: Switch Package Manager from pnpm to Yarn"
status: approved
created: 2026-07-01
approved: 2026-07-01
---

# Sprint Change Proposal: Switch Package Manager from pnpm to Yarn

## 1. Issue Summary

**Trigger:** The repository should use Yarn instead of pnpm. Reason given: preference/familiarity — no pnpm-specific defect is forcing this change.

**Discovery context:** While scoping this change, investigation of the current repository state surfaced that the package-manager choice has already thrashed once, and the previous attempt to move off pnpm was left incomplete:

- `9373d27 feat: init codebase` — repo initialized.
- `15c7601 ci: switch from pnpm to npm` — deleted `pnpm-lock.yaml` (17,961 lines) and `pnpm-workspace.yaml`, but **only** removed the `"pnpm": { "onlyBuiltDependencies": [...] }` config block from `package.json`. It did **not** update `package.json`'s `dev` script (still `pnpm nx run-many -t dev serve`), `.github/workflows/test.yml` (still uses `pnpm/action-setup`, `pnpm install --frozen-lockfile`, etc.), `scripts/*.sh`, `docs/ci.md`, or `playwright/README.md`.
- `8e5ae9f ci: use yarn` and later devcontainer commits — `.devcontainer/create.sh` was separately updated to run `corepack prepare yarn@stable --activate` and `yarn install` at the repo root, **without** the rest of the tooling (CI, scripts, docs) being updated to match.
- Present working tree: `pnpm-lock.yaml` and `.pnpm-store/` exist **untracked** (regenerated locally, e.g. by running `pnpm install` against the still-pnpm-flavored `package.json`/CI), while `.gitignore` line 55 **ignores `yarn.lock`** — meaning even a correct yarn migration would silently fail to commit its own lockfile unless `.gitignore` is fixed.

Net effect: the repository is currently in an inconsistent three-way state (npm intent in one commit, yarn intent in devcontainer scripts, pnpm commands everywhere else, no committed lockfile of any kind). This change both completes the user's requested pnpm→yarn switch and resolves that inconsistency in one pass, rather than leaving a second half-finished migration.

**Evidence:**
- `git log --oneline -- .devcontainer/create.sh` shows the pnpm → npm → yarn commit sequence above.
- `.gitignore:55` contains `yarn.lock` (should be tracked, not ignored, once yarn is the chosen package manager).
- No `pnpm-lock.yaml` or `yarn.lock` is currently committed to `HEAD` at all.
- Architecture and Epics documents still specify pnpm explicitly as the scaffold and CI package manager.

## 2. Impact Analysis

### Epic Impact

- **Epic 1 (Authentication & Repository Connection):** Story 1.1 ("Scaffold the Platform Monorepo and CI Pipeline") is marked `done` and its acceptance criteria explicitly reference the pnpm-based `create-nx-workspace` command and CI setup. Per your direction, this story's deliverable is reworked in place (its AC text and status are amended) rather than rolled back — Stories 1.2–1.5 (already done/in review) do not depend on the package-manager choice and carry forward unchanged.
- **Epics 2 and 3:** No functional impact. Neither epic's acceptance criteria reference the package manager.

### Story Impact

- **Story 1.1:** Acceptance criteria updated to reference Yarn (Berry, via Corepack) instead of pnpm; status reverts from `done` to `review` pending re-verification of the scaffold/CI changes below.
- **Stories 1.2–1.5:** No changes.
- **No new stories, no removed stories.**

### Artifact Conflicts

**Epics document** (`_bmad-output/planning-artifacts/epics.md`):
- Line 98, "Additional Requirements": scaffold command references `--packageManager=pnpm`.
- Story 1.1 acceptance criteria reference the pnpm-based initialization command.

**Architecture document** (`_bmad-output/planning-artifacts/architecture.md`):
- Line 155: "Nx workspace with pnpm."
- Lines 186–187: Initialization Commands use `--packageManager=pnpm`.
- Line 492: Source Tree lists `pnpm-workspace.yaml` (not actually needed — this is a single-package Nx "integrated" monorepo; no `apps/*/package.json` or `libs/*/package.json` exist, so no workspace-config file is required for Yarn either).
- Line 823: Decision Impact Analysis / Implementation Sequence references the pnpm scaffold command.

**PRD:** No conflict — the PRD does not mention a package manager.

**UX Design:** No conflict.

### Technical Impact (non-planning artifacts)

| File | Current state | Change needed |
|---|---|---|
| `package.json` | `"dev": "pnpm nx run-many -t dev serve"`, no `packageManager` field | `"dev": "yarn nx run-many -t dev serve"`; add `"packageManager": "yarn@4.6.0"` (pin, not `@stable`, for reproducibility) |
| `pnpm-lock.yaml`, `.pnpm-store/` | Untracked, present in working tree | Delete; generate `yarn.lock` via `yarn install` and commit it |
| `.gitignore` | Line 55 ignores `yarn.lock` | Remove `yarn.lock` from the ignore list (lockfiles must be committed) |
| `.github/workflows/test.yml` | `pnpm/action-setup@v4`, `PNPM_VERSION` env, `pnpm install --frozen-lockfile`, `pnpm exec ...`, cache keyed on `pnpm-lock.yaml` | Replace with `corepack enable` (version comes from `packageManager` field), `actions/setup-node@v4` with `cache: 'yarn'`, `yarn install --immutable`, `yarn <bin>` (no `exec` prefix needed), cache key on `yarn.lock` |
| `scripts/burn-in.sh`, `scripts/ci-local.sh`, `scripts/test-changed.sh` | `pnpm exec nx ...`, `pnpm exec playwright ...` | `yarn nx ...`, `yarn playwright ...` |
| `docs/ci.md` | Describes pnpm stack, pnpm lockfile checks, pnpm troubleshooting | Update stack description and troubleshooting section to Yarn equivalents |
| `playwright/README.md` | All example commands use `pnpm` | Update to `yarn` equivalents |
| `.vscode/launch.json` | `"runtimeExecutable": "pnpm"` | `"runtimeExecutable": "yarn"` |
| `apps/agent-be/project.json` | `prune-lockfile` target declares output `dist/apps/agent-be/pnpm-lock.yaml` | Change declared output to `dist/apps/agent-be/yarn.lock` (the `@nx/js:prune-lockfile` executor auto-detects the package manager; only the declared cache output path is stale) |
| `.devcontainer/create.sh` | Already runs `corepack prepare yarn@stable --activate` + `yarn install` | Simplify to `corepack enable` (relies on the new `packageManager` field for version pinning instead of `@stable`) |
| `.yarnrc.yml` | Does not exist | Create with `nodeLinker: node-modules` — required for Next.js/Nx compatibility; Yarn Berry's default Plug'n'Play linker is not reliably supported by Next.js's build tooling or several Nx plugins |
| `CLAUDE.md` | Generic Nx guidance example: "e.g., \`pnpm nx build\`, \`npm exec nx test\`" | Cosmetic only — optional update to `yarn nx build` for consistency; not functionally load-bearing |

## 3. Recommended Approach

**Selected approach: Direct Adjustment (Option 1), applied against Story 1.1's already-`done` deliverable rather than a full rollback.**

- **Effort:** Low. This is a mechanical package-manager substitution — no application logic, no data model, no API contract changes. The bulk of the work is find-and-replace across CI config, shell scripts, and docs, plus generating and committing one lockfile.
- **Risk:** Low-to-Medium. The one real risk is the Yarn Berry PnP-vs-node-modules linker decision — getting this wrong breaks `next build`/Nx plugin resolution. This proposal pins `nodeLinker: node-modules` to avoid that class of failure, consistent with common Next.js/Nx practice.
- **Rollback (Option 2) was not selected:** reverting Stories 1.2–1.5 would be pure churn — none of their acceptance criteria or implementation depend on the package manager, so there is nothing to gain by rolling them back.
- **MVP Review (Option 3) does not apply:** no PRD requirement, scope item, or success metric is affected.

This also resolves the pre-existing pnpm→npm half-migration described in §1, so the repository ends this change in a single, consistent state instead of accumulating a third inconsistent variant.

## 4. Detailed Change Proposals

### Epics (`_bmad-output/planning-artifacts/epics.md`)

**Section: Additional Requirements (line 98)**

OLD:
```
Starter/greenfield template: Nx workspace with pnpm (`npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=pnpm`), generating `apps/web` (Next.js 15, App Router, Tailwind, Turbopack), `apps/agent-be` (NestJS), `libs/shared-types`, `libs/database-schemas`. This is the first implementation story (Epic 1, Story 1).
```

NEW:
```
Starter/greenfield template: Nx workspace with Yarn (`npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=yarn`), generating `apps/web` (Next.js 15, App Router, Tailwind, Turbopack), `apps/agent-be` (NestJS), `libs/shared-types`, `libs/database-schemas`. Yarn is pinned via a `packageManager` field in `package.json` and installed through Corepack, with `nodeLinker: node-modules` in `.yarnrc.yml` for Next.js/Nx compatibility. This is the first implementation story (Epic 1, Story 1).
```

**Rationale:** Reflects the corrected package manager decision at its source of truth so future stories/readers don't re-derive pnpm as canonical.

**Story 1.1 Acceptance Criteria**

OLD:
```
**Given** an empty repository
**When** the Nx workspace is initialized per the architecture's Initialization Commands
**Then** `apps/web` (Next.js 15, App Router, Tailwind, TypeScript strict), `apps/agent-be` (NestJS), `libs/shared-types`, and `libs/database-schemas` exist and build successfully via `nx build`
**And** `libs/database-schemas` contains the initial Prisma schema (User model at minimum) and generates a client consumed by both apps against a single Railway Postgres instance
```

NEW:
```
**Given** an empty repository
**When** the Nx workspace is initialized per the architecture's Initialization Commands (Yarn-based, Corepack-pinned)
**Then** `apps/web` (Next.js 15, App Router, Tailwind, TypeScript strict), `apps/agent-be` (NestJS), `libs/shared-types`, and `libs/database-schemas` exist and build successfully via `nx build`
**And** `libs/database-schemas` contains the initial Prisma schema (User model at minimum) and generates a client consumed by both apps against a single Railway Postgres instance
**And** `yarn.lock` is committed to the repository and CI installs with `yarn install --immutable`
```

**Rationale:** Makes the lockfile commit an explicit, testable AC — the prior pnpm migration attempt failed silently in part because no AC enforced that the lockfile actually gets committed.

### Architecture (`_bmad-output/planning-artifacts/architecture.md`)

**Line 155**

OLD: `Nx workspace with pnpm.`
NEW: `Nx workspace with Yarn (Berry, via Corepack).`

**Lines 186–187**

OLD:
```
# 1. Create Nx workspace (empty preset, pnpm)
npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=pnpm
```
NEW:
```
# 1. Create Nx workspace (empty preset, yarn)
npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=yarn
```

**Line 492 (Source Tree)**

OLD: `├── pnpm-workspace.yaml`
NEW: `├── .yarnrc.yml`

**Rationale:** This is a single-package Nx "integrated" monorepo — no per-app/per-lib `package.json` files exist, so no workspace-config file is functionally required by either pnpm or Yarn. The tree entry should point at the file that actually matters for Yarn: `.yarnrc.yml`, which pins `nodeLinker: node-modules`.

**Line 823**

OLD: `...per the Initialization Commands in Starter Template Evaluation (\`npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=pnpm\`, ...)`
NEW: `...per the Initialization Commands in Starter Template Evaluation (\`npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=yarn\`, ...)`

### Implementation files (executed by Developer, not part of this planning-artifact proposal but tracked here for handoff completeness)

- `package.json`: `dev` script → `yarn nx run-many -t dev serve`; add `"packageManager": "yarn@4.6.0"`.
- Delete untracked `pnpm-lock.yaml`, `.pnpm-store/`; run `yarn install` to generate and commit `yarn.lock`.
- `.gitignore`: remove the `yarn.lock` line.
- `.github/workflows/test.yml`: replace all four `pnpm/action-setup` blocks + `PNPM_VERSION` with Corepack-based setup; `pnpm install --frozen-lockfile` → `yarn install --immutable`; all `pnpm exec <cmd>` → `yarn <cmd>`; cache key `hashFiles('**/pnpm-lock.yaml')` → `hashFiles('**/yarn.lock')`.
- `scripts/burn-in.sh`, `scripts/ci-local.sh`, `scripts/test-changed.sh`: `pnpm exec` → `yarn`.
- `docs/ci.md`: update stack line, lockfile-exists check, and the two pnpm-specific troubleshooting entries.
- `playwright/README.md`: update all `pnpm ...` example commands to `yarn ...`.
- `.vscode/launch.json`: `"runtimeExecutable": "pnpm"` → `"yarn"`.
- `apps/agent-be/project.json`: `prune-lockfile` target's declared output `pnpm-lock.yaml` → `yarn.lock`.
- `.devcontainer/create.sh`: simplify `corepack prepare yarn@stable --activate` → `corepack enable` (version now comes from `package.json`'s `packageManager` field).
- New `.yarnrc.yml`: `nodeLinker: node-modules`.
- Optional/cosmetic: `CLAUDE.md`'s generic Nx example command.

## 5. Implementation Handoff

**Scope classification: Moderate** — reopens a `done` story (backlog reorganization) and touches CI/tooling broadly, but no PRD/UX impact, no new epics, no architectural redesign beyond a tooling substitution.

**Sprint status update (on approval):**
```yaml
1-1-scaffold-the-platform-monorepo-and-ci-pipeline: review   # was: done
```
No other story or epic entries change.

**Handoff:**
1. **Product Owner / Developer** — confirm the amended Story 1.1 acceptance criteria above, then reopen the story for implementation.
2. **Developer agent** — apply the implementation-file changes listed in §4, verify `nx build` for all four projects, verify CI passes with Yarn end-to-end (lint, unit, E2E shards), then move Story 1.1 back to `done`.

**Success criteria:**
- `yarn.lock` is committed at repo root; no `pnpm-lock.yaml` or `.pnpm-store/` remain, tracked or untracked.
- `yarn install --immutable` succeeds in CI from a clean checkout.
- `nx build` succeeds for `apps/web`, `apps/agent-be`, `libs/shared-types`, `libs/database-schemas`.
- Full CI pipeline (lint, unit/integration, E2E 4 shards) passes on Yarn.
- No remaining `pnpm` references outside of historical git commit messages.
