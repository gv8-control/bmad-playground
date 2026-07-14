---
baseline_commit: 2f52de620a7db504133f5181d24e0b35ceaf8390
---

# Story 4.1: Provision the Vercel Project for `apps/web`

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the platform operator,
I want a Vercel project configured for `apps/web` in this Nx monorepo,
so that the frontend has a deployable production target.

## Acceptance Criteria

1. **AC-1 (Project created with correct monorepo configuration):** Given the Nx monorepo with `apps/web` at its current path, When the Vercel project is created, Then its root directory is set to `apps/web`, the framework preset is Next.js, and a production build succeeds against the monorepo (Turbopack root resolves to the workspace root per the existing `next.config.js`). And the Vercel project's install command runs at the workspace root (`yarn install --immutable`) and the build command includes a `prisma generate` step (from `libs/database-schemas`) before `nx build web`, so the shared Prisma client is available to `apps/web` at build time against the production `DATABASE_URL`.

2. **AC-2 (Auto-deploy disabled):** Given the project is created, When deploys are configured, Then automatic deploy-on-push is disabled (deploy stays manual, per architecture) — either by not connecting a GitHub integration or by setting `git.deploymentEnabled: false` in `vercel.json`.

3. **AC-3 (Placeholder production URL exists):** Given the project needs a reachable URL before the GitHub OAuth App can be registered (Story 4.5 dependency), When this story completes, Then at least a placeholder `*.vercel.app` production URL exists.

## Tasks / Subtasks

- [x] **Task 1: Create `vercel.json` at `apps/web/vercel.json`** (AC: #1, #2)
  - [x] 1.1 Create `vercel.json` at `apps/web/vercel.json` (inside the Vercel project's `rootDirectory`). Vercel reads configuration files from the project's root directory, which is `apps/web` per the project settings. Verify by testing — if Vercel does not pick it up from `apps/web/`, move it to the monorepo root and redeploy
  - [x] 1.2 Set `framework: "nextjs"` to explicitly declare the framework preset
  - [x] 1.3 Set `installCommand: "yarn install --immutable"` to enforce immutable installs at the workspace root
  - [x] 1.4 Set `buildCommand: "yarn nx run database-schemas:generate && yarn nx build web"` to ensure the Prisma client is generated before the Next.js build (see Implementation Note #5 for why `yarn nx run database-schemas:generate` is used instead of a bare `prisma generate` with a relative path). The AC explicitly requires the `prisma generate` step in the build command; `nx build web`'s own `dependsOn: ["^generate"]` should also trigger it, but the explicit invocation is belt-and-suspenders
  - [x] 1.5 Set `git: { deploymentEnabled: false }` to disable all automatic deployments (AC-2)
  - [x] 1.6 Add `"$schema": "https://openapi.vercel.sh/vercel.json"` for IDE validation

- [x] **Task 2: Create the Vercel project via the REST API** (AC: #1, #3)
  - [x] 2.1 Read `VERCEL_TOKEN` from `.env.local` (value starts with `vcp_`)
  - [x] 2.2 Use team ID `team_DV9hczWkgqbOEoMGnX9Pta3t` (team name: `marius-projects-a878add7`) as the `teamId` query parameter
  - [x] 2.3 Check if the project already exists: `GET https://api.vercel.com/v9/projects?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t&limit=100` and filter by name `bmad-easy`. If it exists, skip creation and use the existing project ID. If not, proceed to 2.4
  - [x] 2.4 Call `POST https://api.vercel.com/v11/projects?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t` with `Authorization: Bearer $VERCEL_TOKEN` and request body:
    ```json
    {
      "name": "bmad-easy",
      "framework": "nextjs",
      "rootDirectory": "apps/web"
    }
    ```
  - [x] 2.5 Do NOT connect a GitHub repository in the project creation payload — this ensures no auto-deploy-on-push (belt-and-suspenders with `vercel.json`'s `git.deploymentEnabled: false`)
  - [x] 2.6 Record the project ID from the response. The production URL is derived from the project name: `bmad-easy.vercel.app` (or `bmad-easy-<hash>.vercel.app` if the name was taken). The URL becomes reachable after Task 3's deployment — the project creation response does not include a production URL (AC-3)
  - [x] 2.7 Record the project ID and production URL in the story's Completion Notes

- [x] **Task 3: Trigger a production deploy to verify the build succeeds** (AC: #1, #3)
  - [x] 3.1 Use `vercel deploy --prod --yes --token=$VERCEL_TOKEN --cwd=apps/web` if the Vercel CLI is available (recommended — simpler than raw API for deploying from a local checkout, and includes the uncommitted `vercel.json` from Task 1 in the upload)
  - [x] 3.2 Alternatively, create a deployment via `POST https://api.vercel.com/v13/deployments?teamId=team_DV9hczWkgqbOEoMGnX9Pta3t` with `projectId` from Task 2, `target: "production"`, and no git source (requires uploading files to Vercel storage first — more complex than the CLI path)
  - [x] 3.3 Poll `GET https://api.vercel.com/v6/deployments/{deploymentId}?teamId=...` until `status` is `READY` or `ERROR`
  - [x] 3.4 If the build fails: inspect build logs via `GET https://api.vercel.com/v2/deployments/{deploymentId}/events?teamId=...`, fix the issue (likely `prisma generate` or `turbopack.root` resolution, or Node.js version mismatch — see Implementation Notes), redeploy
  - [x] 3.5 Verify the production URL returns HTTP 200 (or a redirect to `/sign-in` — the app requires auth)

- [x] **Task 4: Verify auto-deploy is disabled** (AC: #2)
  - [x] 4.1 Check the project settings via `GET https://api.vercel.com/v9/projects/{projectId}?teamId=...` and confirm no Git repository is connected (or if connected, `git.deploymentEnabled` is `false`)
  - [x] 4.2 Verify `vercel.json` is in the repository at `apps/web/vercel.json` and contains `"git": { "deploymentEnabled": false }`

- [x] **Task 5: Commit `vercel.json` to the repository** (AC: #1, #2)
  - [x] 5.1 Stage `apps/web/vercel.json`
  - [x] 5.2 Commit with message: `chore(deploy): add vercel.json for apps/web project configuration`

## Dev Notes

### Deferred Work Check

**Checked:** `_bmad-output/implementation-artifacts/deferred-work.md` was scanned for deferred findings matching file paths or components in scope for this story's code changes.

**Result: No deferred findings in scope.**

The only deferred items referencing `apps/web/next.config.js` are:
- `experimental: {}` is dead config (deferred-work.md:56) — this story does NOT modify `next.config.js`; it references the existing config. The empty `experimental` object is a harmless no-op that does not affect the Vercel build.
- CommonJS `next.config.js` inconsistent with TS/ESM (deferred-work.md:57) — same; this story does not modify `next.config.js`. CommonJS is fully supported by Next.js on Vercel.

No deferred items match `vercel.json`, Vercel project configuration, or CI workflow files.

### Decisions (per decision-policy.md)

**Decision (DP-3):** Disable auto-deploy via `vercel.json`'s `git.deploymentEnabled: false` rather than relying solely on not connecting a GitHub integration. Both approaches work, but the `vercel.json` approach is version-controlled and self-documenting — a future operator can see the intent in the repo without inspecting Vercel dashboard state. Belt-and-suspenders with not connecting a GitHub repo in the API creation call.

**Decision (DP-3):** Create `vercel.json` at `apps/web/vercel.json` (not the monorepo root). Vercel's `rootDirectory` project setting is `apps/web`, so Vercel reads configuration from that directory. Placing `vercel.json` at the monorepo root would not be picked up when `rootDirectory` is set. The developer must verify this by testing — if Vercel reads `vercel.json` from the monorepo root instead, move it there.

**Decision (DP-3):** Use the Vercel REST API (`POST /v11/projects`) for project creation rather than the Vercel CLI. The epics note (2026-07-11) confirms API automation is verified: "Project creation and deletion were confirmed via `POST/DELETE https://api.vercel.com/v10/projects`." The API is scriptable, idempotent (can check if project exists before creating), and doesn't require installing the Vercel CLI. If the CLI is already available, `vercel link` + `vercel deploy --prod` is an acceptable alternative for the deploy step (Task 3).

**Decision (DP-3):** Build command is `yarn nx run database-schemas:generate && yarn nx build web`. The Nx `build` target already has `dependsOn: ["^generate"]` which runs `prisma generate` on `database-schemas` before building `web`. However, the AC explicitly requires the `prisma generate` step in the build command, so it is included explicitly. If `nx build web` already triggers `^generate` correctly on Vercel, the explicit `nx run database-schemas:generate` is a harmless no-op (idempotent). See Implementation Note #5 for path-resolution rationale.

### Architecture Compliance

**Infrastructure & Deployment (architecture.md:282-290):**
- `apps/web` deploys to Vercel. ✓ This story provisions that target.
- CI/CD: "deploy is a manual trigger, not automatic on merge." ✓ AC-2 disables auto-deploy.
- Environments: "production only for MVP, no separate staging." ✓ Only production target is configured.

**Deployment Structure (architecture.md:680):**
- "Vercel builds `apps/web` from the Nx monorepo (root directory `apps/web`)." ✓ The Vercel project's `rootDirectory` is set to `apps/web`.
- "Both deploys are manually triggered, gated by the GitHub Actions lint/test workflow." ✓ Auto-deploy disabled; the actual CI deploy job is Story 4.6.

**Build Process Structure (architecture.md:678):**
- "`nx build <app>` per app. `libs/database-schemas` generates the Prisma client as a build step consumed by both." ✓ The build command includes `prisma generate` before `nx build web`.

**Turbopack Root (next.config.js:12-14):**
- `turbopack.root: path.resolve(__dirname, '../..')` resolves to the monorepo workspace root. On Vercel, `__dirname` is `apps/web/` (the `rootDirectory`), so `../..` resolves to the monorepo root. This should work correctly — Vercel clones the full monorepo and sets the working directory to `apps/web/`. **Verify this during the build test (Task 3).**

### Library / Framework Requirements

- **Vercel REST API v11** — `POST https://api.vercel.com/v11/projects` for project creation. Request body: `{ name, framework, rootDirectory }`. Query param: `teamId`. Auth: `Authorization: Bearer <token>`.
- **Vercel REST API v13** — `POST https://api.vercel.com/v13/deployments` for triggering a deploy. Request body: `{ name, project: projectId, target: "production", gitSource: {...} }` or no git source for a local upload deploy.
- **Vercel REST API v6** — `GET https://api.vercel.com/v6/deployments/{id}` for polling deployment status. Response includes `status: "READY" | "ERROR" | "BUILDING" | "QUEUED"`.
- **vercel.json** — static configuration file. Supports `framework`, `buildCommand`, `installCommand`, `git.deploymentEnabled`, `$schema`. See [Vercel docs](https://vercel.com/docs/project-configuration/vercel-json) and [Git Configuration](https://vercel.com/docs/project-configuration/git-configuration).
- **Nx build targets** — `nx build web` runs the Next.js build. The `build` target in `apps/web/project.json` has `dependsOn: ["^generate"]` which triggers `prisma generate` on `database-schemas` first. The `generate` target in `libs/database-schemas/project.json` runs `prisma generate --config prisma.config.ts` with `cwd: "libs/database-schemas"`.
- **Yarn Berry** — `yarn install --immutable` enforces lockfile fidelity (fails if `yarn.lock` is out of sync). Corepack-pinned to Yarn 4.17.0 via `packageManager` field in `package.json`.

### File Structure Requirements

**Files to CREATE (NEW):**

| File | What it does |
|---|---|
| `apps/web/vercel.json` | Vercel project configuration: framework preset, build/install commands, auto-deploy disabled |

**Files NOT to modify (preserved interactions — do NOT regress):**

| File | Why preserved |
|---|---|
| `apps/web/next.config.js` | Referenced by AC-1 ("Turbopack root resolves to the workspace root per the existing `next.config.js`") but NOT modified. The existing `turbopack.root: path.resolve(__dirname, '../..')` must work on Vercel as-is. Deferred items about `experimental: {}` and CommonJS format are NOT in scope (DP-5). |
| `.github/workflows/test.yml` | CI deploy job is Story 4.6, not this story. |
| `apps/web/project.json` | Nx build config is already correct (`dependsOn: ["^generate"]`). No changes needed. |
| `libs/database-schemas/project.json` | Prisma generate target is already correct. No changes needed. |
| `package.json` | No script changes needed. |

### Current State of Key Code (READ BEFORE IMPLEMENTING)

**`apps/web/next.config.js` (52 lines) — the Turbopack root resolution:**
```javascript
const path = require('path');
const nextConfig = {
  serverExternalPackages: ['pg', '@prisma/adapter-pg'],
  experimental: {},
  turbopack: {
    root: path.resolve(__dirname, '../..'),  // resolves to monorepo root
  },
  async headers() { /* security headers — CSP, HSTS, etc. */ },
};
module.exports = nextConfig;
```
On Vercel, `__dirname` is the `apps/web/` directory (the `rootDirectory`), so `path.resolve(__dirname, '../..')` resolves to the monorepo root. Vercel clones the full monorepo, so the workspace root exists. **This should work without modification.**

**`apps/web/project.json` (27 lines) — Nx build target:**
```json
{
  "targets": {
    "build": {
      "dependsOn": ["^generate"]
    }
  }
}
```
The `^generate` prefix means "run the `generate` target on all dependencies" — `database-schemas` has a `generate` target that runs `prisma generate --config prisma.config.ts`. So `nx build web` should automatically run `prisma generate` first. However, on Vercel the build runs from `apps/web/` as the working directory, and Nx needs to resolve the workspace root to find `database-schemas`. **Verify this works — if Nx can't resolve the workspace, the explicit `prisma generate` in the build command (Task 1.4) covers it.**

**`libs/database-schemas/project.json` (22 lines) — Prisma generate target:**
```json
{
  "targets": {
    "generate": {
      "executor": "nx:run-commands",
      "options": {
        "command": "prisma generate --config prisma.config.ts",
        "cwd": "libs/database-schemas"
      }
    }
  }
}
```
The `cwd` is relative to the workspace root. On Vercel, the build command runs from `apps/web/`, so using `yarn nx run database-schemas:generate` (which Nx resolves via the workspace root) is the correct approach — not a bare `prisma generate` with a relative path that would break from `apps/web/`.

**`.env.local` — Vercel token:**
`VERCEL_TOKEN` is available in `.env.local` (value starts with `vcp_`). Do NOT hardcode the token value in any committed file — read it from `.env.local` at runtime.
Team ID: `team_DV9hczWkgqbOEoMGnX9Pta3t` (team name: `marius-projects-a878add7`) — from the epics note (2026-07-11).

### Project Structure Notes

- `vercel.json` lives at `apps/web/vercel.json` (inside the `rootDirectory` Vercel reads from). This is consistent with Vercel's documented behavior: configuration files are read from the project root directory.
- No `libs/` changes needed — `libs/database-schemas` is already correctly configured with the `generate` target.
- The Vercel project name should be `bmad-easy` (matching the `package.json` `name` field and the Nx workspace name).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1] — Story definition and ACs (lines 941-962)
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment] — Deployment constraints (lines 282-290)
- [Source: _bmad-output/planning-artifacts/architecture.md#Deployment Structure] — Vercel builds from Nx monorepo (line 680)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-03.md] — Epic 4 creation rationale and story definitions
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-11.md] — Epic 4 readiness assessment (Stories 4.1-4.12)
- [Source: apps/web/next.config.js] — Turbopack root configuration (lines 12-14)
- [Source: apps/web/project.json] — Nx build target with `^generate` dependency (line 10)
- [Source: libs/database-schemas/project.json] — Prisma generate target (lines 9-14)
- [Source: .env.local] — `VERCEL_TOKEN` available (value not reproduced here — read from `.env.local` at runtime)
- [Source: https://vercel.com/docs/project-configuration/vercel-json] — vercel.json property reference
- [Source: https://vercel.com/docs/project-configuration/git-configuration] — `git.deploymentEnabled` property

### Previous Story Intelligence

This is the first story in Epic 4. The most recent completed story is 3-12 (Drain Conversations Gracefully on Deploy). Key learnings from Epic 3 that apply here:

- **DP-3 pattern:** Pick the simplest reversible option. For this story, that means using the Vercel REST API (confirmed working per the epics note) rather than installing the Vercel CLI, and using `vercel.json` for configuration rather than dashboard-only settings.
- **Decision recording:** Record every autonomous decision in the Dev Notes with the DP reference. The 3-12 story's decision log is the canonical pattern.
- **File preservation:** Explicitly list files NOT to modify and why. This prevents scope creep (DP-5).

### Git Intelligence

Recent commits (last 10):
```
2f52de6 Merge remote-tracking branch 'origin/main' into feat/epic-4
4cef645 Merge pull request #17 from gv8-control/fix/develop-epic-arg-passing
5d37e7d fix(pipeline): pass epic argument through to develop-epic webhook
968bb4a docs(epics): apply Epic 4 implementation readiness findings
b8cb9f5 fix(devcontainer): authenticate daytona cli during create (#15)
c9ef768 docs(epics): annotate Epic 4 stories with API automation verification and decisions
734bafd fix(devcontainer): make yarn install non-interactive (#14)
```

The `feat/epic-4` branch is being merged. The `docs(epics)` commits show Epic 4 stories were recently annotated with API automation verification — the epics file is up-to-date with the latest decisions.

### Latest Technical Information

- **Vercel REST API (v11/v13):** The `POST /v11/projects` endpoint accepts `name`, `framework`, `rootDirectory` in the request body. The `teamId` is a query parameter. The `POST /v13/deployments` endpoint triggers a deploy. Polling deployment status via `GET /v6/deployments/{id}`.
- **vercel.json `git.deploymentEnabled`:** Confirmed valid property. Setting to `false` (boolean) disables all automatic deployments across all branches. See [Git Configuration docs](https://vercel.com/docs/project-configuration/git-configuration).
- **Next.js 16 on Vercel:** Next.js ~16.1.6 is fully supported on Vercel. The framework preset `nextjs` auto-detects Next.js and applies correct build settings. Turbopack is supported in production builds as of Next.js 16.
- **Nx 23 on Vercel:** Nx is a dev dependency, not a runtime dependency. The build command `yarn nx run database-schemas:generate && yarn nx build web` runs Nx targets that resolve the workspace root correctly from any directory. Vercel's `installCommand` runs at the workspace root (where `package.json` lives), so `yarn` and `nx` are available. The `buildCommand` runs from the `rootDirectory` (`apps/web/`), but Nx resolves the workspace root via `nx.json`/`package.json` at the monorepo root.

### Important Implementation Notes

1. **Vercel project name:** Use `bmad-easy` (not `bmad-easy-web` or `apps-web`). The Vercel project name becomes part of the `*.vercel.app` URL: `bmad-easy.vercel.app` (or `bmad-easy-<hash>.vercel.app` if the name is taken).

2. **Production URL for OAuth callback:** The `*.vercel.app` URL from this story is needed by Story 4.5 to update the GitHub OAuth App callback URL. The existing OAuth App (`AUTH_GITHUB_ID=Ov23liwPSopCBFh9nMRN`) currently has callback URL `http://localhost:3000/api/auth/callback/github` — Story 4.5 updates it to `https://bmad-easy.vercel.app/api/auth/callback/github`.

3. **`DATABASE_URL` on Vercel:** The build needs `DATABASE_URL` at build time for `prisma generate` (the Prisma client is generated against the schema, not the database, but the schema references the connection string for the client runtime). Story 4.5 wires the actual production `DATABASE_URL` as a Vercel env var. For this story's build test (Task 3), the build may fail if `DATABASE_URL` is not set — `prisma generate` itself does not require a live database connection, but the Next.js build may fail if app code imports Prisma and tries to connect at build time (it shouldn't — Server Components connect at request time, not build time). If the build fails due to missing `DATABASE_URL`, set a placeholder value for the build test and note it for Story 4.5 to replace.

4. **`vercel.json` location:** The `vercel.json` file must be in the Vercel project's `rootDirectory` (`apps/web/`). If Vercel doesn't pick it up from there, move it to the monorepo root and test again. The Vercel docs say "This file should be created in your project's root directory" — when `rootDirectory` is `apps/web`, the project's root directory is `apps/web/`.

5. **Build command path resolution:** Vercel runs `buildCommand` from the `rootDirectory` (`apps/web/`). Use `yarn nx run database-schemas:generate` (not a bare `prisma generate` with a relative config path) because Nx resolves the workspace root and the target's `cwd: "libs/database-schemas"` correctly from any directory in the workspace. A bare `prisma generate --config libs/database-schemas/prisma.config.ts` would fail because that path is relative to the workspace root, not to `apps/web/`.

6. **Node.js version mismatch risk:** `.nvmrc` specifies Node.js 24. Vercel may not support Node.js 24 yet — verify Vercel's supported Node.js versions before deploying. If Vercel's default Node.js version differs, set `NODE_VERSION` env var on the Vercel project to match (or the closest supported version). A version mismatch can cause build failures from incompatible APIs or native module compilation errors. Check build logs for Node.js version warnings if the build fails.

7. **Idempotency:** If the Vercel project already exists (e.g., from a previous attempt), `POST /v11/projects` will return a 409 conflict. Check for existing projects first via `GET https://api.vercel.com/v9/projects?teamId=...&limit=100` and filter by name. If it exists, update it via `PATCH https://api.vercel.com/v9/projects/{projectId}?teamId=...` instead of creating a new one.

8. **Do NOT connect a GitHub repository:** The Vercel project should NOT have a connected GitHub repo. Deploys are triggered manually (via API or CLI in Story 4.6's CI job). Connecting a GitHub repo would enable auto-deploy-on-push, which violates the architecture's "deploy is a manual trigger, not automatic on merge" constraint.

### ATDD Artifacts

- **Checklist:** `_bmad-output/test-artifacts/atdd-checklist-4-1-provision-the-vercel-project-for-apps-web.md`
- **Unit tests:** `apps/web/src/__tests__/vercel-config.spec.ts` (8 tests, all `test.skip()` — TDD red phase)
- **E2E tests:** Deferred — no browser-level mock can simulate Vercel API operations (see checklist for feasibility check)

**Activation:** After creating `vercel.json` (Task 1), remove `test.skip()` from all tests in `vercel-config.spec.ts` and run `yarn nx test web -- --testPathPattern=vercel-config` to verify green phase.

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- RED phase: All 8 tests in `vercel-config.spec.ts` un-skipped and run. All failed for expected reason — `vercel.json` did not exist, so `loadVercelConfig()` returned `{}` and all property assertions failed on `undefined`.
- GREEN phase: Created `apps/web/vercel.json` with all 6 required properties. All 720 web tests pass (62 test suites), including the 8 vercel-config tests.
- REFACTOR: No refactor needed — `vercel.json` is a static JSON config file with minimal structure.
- Task 2: Vercel project created via `POST /v11/projects`. Project ID: `prj_ih4UAxO759A1CHdrZ93j4rk3poYD`. No Git repo connected (no `link` field in response). Node version: `24.x`.
- Task 3 first attempt: `vercel deploy --prod --yes --cwd=apps/web` — FAILED. CLI created a new project named `web` (from directory name) instead of targeting `bmad-easy`. Also, deploying from `--cwd=apps/web` only uploads `apps/web/` files, missing the monorepo root. Deleted the accidental `web` project via `DELETE /v9/projects/web`.
- Task 3 second attempt: `vercel deploy --prod --yes --name=bmad-easy` from monorepo root — FAILED. Build error: TypeScript strict mode error in `AgentMessage.tsx:18` — `React.ReactElement.props` is `unknown` in React 19 types. Fixed by casting `props` to `{ children?: React.ReactNode }`.
- Task 3 third attempt: `vercel deploy --prod --yes` (project already linked) — SUCCESS. Build completed in ~4 minutes. Production URL aliased to `https://bmad-easy.vercel.app`.
- Task 3.5: Production URL returns HTTP 302 redirect to `/sign-in?callbackUrl=%2F` — expected (app requires auth).
- Task 4: Project settings confirm no Git repo connected. `vercel.json` tests confirm `git.deploymentEnabled: false`.

### Completion Notes List

- **Task 1 COMPLETE:** Created `apps/web/vercel.json` with `$schema`, `framework: "nextjs"`, `installCommand: "yarn install --immutable"`, `buildCommand: "yarn nx run database-schemas:generate && yarn nx build web"`, and `git: { deploymentEnabled: false }`. All 8 ATDD tests activated (skip markers removed) and passing. Test file header updated from red-phase to green-phase.
- **Task 2 COMPLETE:** Vercel project created via REST API (`POST /v11/projects`). Project ID: `prj_ih4UAxO759A1CHdrZ93j4rk3poYD`. Team: `marius-projects-a878add7`. No GitHub repo connected. Node version: `24.x` (matches `.nvmrc`).
- **Task 3 COMPLETE:** Production deploy succeeded via Vercel CLI (`vercel deploy --prod --yes`). Build completed successfully — `prisma generate` ran, `nx build web` compiled, all 13 static pages generated. Production URL: `https://bmad-easy.vercel.app` (returns HTTP 302 → `/sign-in` — app requires auth). Fixed pre-existing TypeScript strict error in `AgentMessage.tsx` that blocked the build (React 19 `ReactElement.props` defaults to `unknown`).
- **Task 4 COMPLETE:** Verified via `GET /v9/projects/{projectId}` — no Git repo connected (no `link` field). `vercel.json` contains `git: { deploymentEnabled: false }` (verified by tests).
- **Task 5 COMPLETE:** Committed `apps/web/vercel.json`, `apps/web/src/__tests__/vercel-config.spec.ts`, `.gitignore`, and `apps/web/.gitignore` as `chore(deploy): add vercel.json for apps/web project configuration` (commit `112b4fb`). Committed `AgentMessage.tsx` fix separately as `fix(web): resolve TypeScript strict error in AgentMessage extractText` (commit `9ba1833`).

**Vercel Project Details:**
- Project ID: `prj_ih4UAxO759A1CHdrZ93j4rk3poYD`
- Project name: `bmad-easy`
- Production URL: `https://bmad-easy.vercel.app`
- Team: `marius-projects-a878add7` (`team_DV9hczWkgqbOEoMGnX9Pta3t`)
- Framework: `nextjs`
- Root directory: `apps/web`
- Node version: `24.x`
- Git repo: NOT connected (auto-deploy disabled)

### File List

- `apps/web/vercel.json` — **CREATED** — Vercel project configuration (framework, install/build commands, auto-deploy disabled, $schema)
- `apps/web/src/__tests__/vercel-config.spec.ts` — **MODIFIED** — Removed all 8 `test.skip()` markers; updated header from red-phase to green-phase
- `apps/web/src/components/conversation/AgentMessage.tsx` — **MODIFIED** — Fixed TypeScript strict error: cast `ReactElement.props` to `{ children?: React.ReactNode }` (React 19 types `props` as `unknown` by default)
- `.gitignore` — **MODIFIED** — Added `.vercel` entry (Vercel CLI local project linking directory)
- `apps/web/.gitignore` — **CREATED** — Contains `.vercel` entry

### Change Log

- 2026-07-12: Task 1 complete — created `apps/web/vercel.json`, activated ATDD tests (8 tests green).
- 2026-07-12: Task 2 complete — created Vercel project via REST API (project ID `prj_ih4UAxO759A1CHdrZ93j4rk3poYD`).
- 2026-07-12: Task 3 complete — production deploy succeeded. Fixed pre-existing TypeScript strict error in `AgentMessage.tsx` (React 19 `ReactElement.props` defaults to `unknown`). Production URL: `https://bmad-easy.vercel.app`.
- 2026-07-12: Task 4 complete — verified auto-deploy disabled (no Git repo connected, `vercel.json` `git.deploymentEnabled: false`).
- 2026-07-12: Task 5 complete — committed changes (`fix(web):...` commit `9ba1833`, `chore(deploy):...` commit `112b4fb`).

### Review Findings

- [x] [Review][Patch] Revert `next-env.d.ts` to baseline state (auto-generated churn from `next build`) [`apps/web/next-env.d.ts:3`]
- [x] [Review][Defer] P1 test casts `buildCommand as string` without `typeof` guard — test quality improvement, low impact (P0 sibling tests catch undefined first) [`apps/web/src/__tests__/vercel-config.spec.ts:65`] — deferred, pre-existing test pattern

### NFR Findings (NFR Evidence Audit — 2026-07-12)

**Audit file:** `_bmad-output/test-artifacts/nfr-assessment-4-1.md`
**Overall Status:** CONCERNS ⚠️ — 0 findings introduced by Story 4.1; all 3 findings are pre-existing or infrastructure concerns.
**Gate Status:** PASS ✅ — proceed to release.

- [NFR][MEDIUM][Defer] No security header verification test for production deployment — `next.config.js` defines security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), but no test verifies these headers are present in the Vercel production deployment. `vercel-config.spec.ts` only validates `vercel.json` file structure. Pre-existing, platform-wide — not introduced by Story 4.1. Now production-relevant because this story deploys to Vercel. Remediation: add a Playwright E2E test or CI step that fetches `https://bmad-easy.vercel.app` and asserts all 6 security headers are present. Owner: platform-wide hardening (Story 4.7 or post-MVP). [`apps/web/next.config.js:16-49`, `apps/web/src/__tests__/vercel-config.spec.ts`]
- [NFR][LOW][Defer] CSP allows `unsafe-inline` and `unsafe-eval` in production — `next.config.js` CSP has `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. Weakens XSS protection in production. Pre-existing in `next.config.js` (not modified by this story, explicitly listed as "Files NOT to modify"). Remediation: tighten CSP to remove `unsafe-inline` and `unsafe-eval` (requires nonce-based CSP or hash-based CSP for Next.js inline scripts). Owner: platform-wide hardening (post-MVP). [`apps/web/next.config.js:36`]
- [NFR][LOW][Defer] No build performance timing regression guard — Vercel build completed in ~4 minutes, but no test or CI step tracks build time to catch performance degradation. Infrastructure concern, not a code concern. ATDD E2E explicitly deferred (no browser-level mock can simulate Vercel build pipeline). Remediation: add a CI step that tracks Vercel build time and alerts on regression (e.g., build time > 10 minutes). Owner: CI/CD hardening (Story 4.6 or post-MVP). [`apps/web/vercel.json:5`, ATDD checklist E2E deferral]
