---
baseline_commit: 3260c58b4154e7626bcc9b672a083f04ae5d3fba
---

# Story 2.1: Mirror Repository Artifacts into Postgres

Status: done

## Story

As the platform,
I want to scan `_bmad-output/` and mirror Artifact metadata and content into Postgres,
So that the Project Map and Artifact Browser can read Artifact state quickly without a live git call on every page view.

## Acceptance Criteria

### AC-1: Page-load / manual-refresh mirroring (FR5)

**Given** a connected repository validated in Epic 1
**When** the platform reads its current state on page load or manual refresh
**Then** the mirroring function scans `_bmad-output/` via the GitHub Contents API and upserts artifact type, title (from frontmatter or path), status (completed/in-progress), last-modified timestamp, and content into Postgres

### AC-2: Commit-time mirroring mechanism (wired in Epic 3)

**Given** an Agent commits a new or updated Artifact during a Conversation (wired in Epic 3)
**When** the commit is detected
**Then** the same upsert shape (type, title, status, lastModifiedAt, content, repoConnectionId) is writeable by the commit-time path — the Prisma model and upsert signature created in this story support it without schema changes

### AC-3: No real-time push detection (FR5)

**Given** no real-time push detection exists in MVP
**When** the Repository changes outside of a page load or manual refresh
**Then** the mirrored state does not update until the next page load or manual refresh

### AC-4: Prisma schema extension with migration

**Given** no `Artifact` table exists yet
**When** this story is implemented
**Then** the Prisma schema (`libs/database-schemas`) is extended with an `Artifact` model (type, title, status, lastModifiedAt, content, repoConnectionId, path) and a migration is generated and committed before the mirroring logic is built against it

### AC-5: Stale artifact cleanup

**Given** an artifact previously mirrored into Postgres has been deleted from `_bmad-output/` in the repository
**When** a full sync completes successfully
**Then** the stale artifact row is removed from Postgres so the Project Map never shows deleted artifacts

### AC-6: Credential failure handling

**Given** the GitHub API returns 401 during the scan
**When** the mirroring function encounters the error
**Then** the credential health is marked `failed` (via the existing `markCredentialFailed` mechanism) and the error is surfaced to the caller — consistent with the Epic 1 credential-failure pattern

### AC-7: Rate-limit and 403 handling

**Given** the GitHub API returns a 403 during the scan
**When** the mirroring function encounters the error
**Then** rate limits are classified via `detectGithubRateLimit` (never marking the credential as failed for a rate limit), and non-rate-limit 403s return null for the inaccessible path (same as the `inspectBmadSetup` pattern) without marking the credential as failed

## Tasks / Subtasks

- [ ] Task 1: Extend the Prisma schema with the `Artifact` model and generate a migration (AC: 4)
  - [ ] 1.1 Add the `Artifact` model to `libs/database-schemas/src/prisma/schema.prisma` with fields: `id` (cuid), `repoConnectionId` (FK to `RepoConnection`), `path` (relative path within `_bmad-output/`), `type` (String), `title` (String), `status` (String, default `"completed"`), `lastModifiedAt` (DateTime), `content` (String, full markdown), `createdAt`, `updatedAt`. Unique constraint on `(repoConnectionId, path)`. Table mapped to `artifacts` via `@@map("artifacts")`. Column names camelCase mapped to snake_case via `@map` — follow the existing `OAuthCredential`/`RepoConnection` pattern exactly
  - [ ] 1.2 Add the `artifacts Artifact[]` relation to the existing `RepoConnection` model (with `onDelete: Cascade` so deleting a repo connection cleans up its artifacts)
  - [ ] 1.3 Generate the migration from `libs/database-schemas/` via `yarn prisma migrate dev --name add_artifact_model --config prisma.config.ts` (run from the `libs/database-schemas/` directory where `prisma.config.ts` provides `datasource.url`; use `yarn` not `npx` per project convention). Verify the generated SQL creates the `artifacts` table, the unique index on `(repo_connection_id, path)`, and the FK to `repo_connections` with `ON DELETE CASCADE`. Commit the migration file
  - [ ] 1.4 Run `yarn nx run database-schemas:generate` to regenerate the Prisma client so `getPrisma().artifact` is available in `apps/web`

- [ ] Task 2: Expand shared types for artifacts (AC: 1, 2)
  - [ ] 2.1 In `libs/shared-types/src/artifact.types.ts`, expand `ArtifactType` to cover all BMAD artifact types: `'brainstorming' | 'prd' | 'architecture' | 'epics' | 'ux' | 'technical-research' | 'market-research' | 'domain-research' | 'product-brief' | 'prfaq' | 'test-arch' | 'other'` (aligned with the CLAUDE.md artifact vocabulary and the actual `_bmad-output/` directory structure)
  - [ ] 2.2 Add `ArtifactStatus = 'completed' | 'in-progress'` type
  - [ ] 2.3 Add a `SyncArtifactsResult` type: `{ success: true; artifactsUpserted: number; artifactsDeleted: number } | { error: string; errorCode: SyncErrorCode }` where `SyncErrorCode = 'NO_CREDENTIAL' | 'RATE_LIMITED' | 'NOT_FOUND' | 'NO_REPO_CONNECTION' | 'UNKNOWN'`
  - [ ] 2.4 Export all new types from `libs/shared-types/src/index.ts` (already barrel-exported via `export * from './artifact.types'`)

- [ ] Task 3: Export reusable GitHub API helpers from `repository-validation.ts` (AC: 1, 7)
  - [ ] 3.1 Export `fetchGithubContents`, `githubHeaders`, `decodeFileContent`, `MAX_CONTENT_PAGES`, `MAX_CONTENT_ENTRIES`, and the `GithubContentEntry` / `GithubFileContent` interfaces from `apps/web/src/lib/repository-validation.ts` so the artifacts module can reuse the existing GitHub Contents API pattern (directory listing with pagination, 401/403/404 handling, rate-limit classification, base64 decoding). These are same-app lib utilities — no cross-service sharing concern
  - [ ] 3.2 Do NOT change any existing behavior of these functions — only change their visibility from module-private to exported

- [ ] Task 4: Build the artifact mirroring logic in `apps/web/src/lib/artifacts.ts` (AC: 1, 3, 5, 6, 7)
  - [ ] 4.1 Create `apps/web/src/lib/artifacts.ts` (NOT a `'use server'` module — it receives a plaintext OAuth token, same security boundary as `inspectBmadSetup` in `repository-validation.ts`). Export `syncArtifacts(accessToken: string, owner: string, repo: string, repoConnectionId: string): Promise<SyncArtifactsResult>`
  - [ ] 4.2 Implement recursive directory scanning: list `_bmad-output/` root via `fetchGithubContents`, then for each subdirectory entry recurse. Collect all `.md` file paths. Use the existing `MAX_CONTENT_PAGES` / `MAX_CONTENT_ENTRIES` pagination caps from `repository-validation.ts` (exported in Task 3.1). Skip non-`.md` files (the PRD defines artifacts as Markdown files). Skip the `project-context.md` file at the `_bmad-output/` root if present (it is a generated context file, not a BMAD artifact)
  - [ ] 4.3 For each `.md` file, fetch its content via `fetchGithubContents` (returns base64-encoded content, decode via `decodeFileContent`). In parallel, fetch the last commit for the file path via `GET /repos/{owner}/{repo}/commits?path={path}&per_page=1` using the same `githubHeaders` + `AbortSignal.timeout(10_000)` pattern. Extract `commit.committer.date` as `lastModifiedAt`. Use `Promise.allSettled` for parallelism but process files in their original order for deterministic upsert. If the commits API call fails (404 for a file with no commit history — exotic), fall back to `new Date()` as `lastModifiedAt`
  - [ ] 4.4 Parse YAML frontmatter from the file content to extract `title` and `status`. Use regex-based extraction matching the existing `parseVersionFromManifest`/`parseVersionFromConfigYaml` pattern in `repository-validation.ts` — do NOT add a YAML parser dependency (e.g. `js-yaml`, `gray-matter`). If frontmatter has a `title` field, use it. If not, extract the first `# Heading` line from the markdown body. If neither, derive a human-readable title from the path (e.g., `planning-artifacts/prds/prd-bmad-easy/prd.md` → `prd`). For `status`: all scanned artifacts default to `"completed"` — the `"in-progress"` status is set only by the Epic 3 commit-time path when an active Conversation is working on the artifact. Do NOT map frontmatter `status: draft` or `status: approved` to the platform artifact status; those are document lifecycle statuses, not platform Conversation-association statuses
  - [ ] 4.5 Derive `ArtifactType` from the file path within `_bmad-output/` using a path-to-type mapping function: `brainstorming/` → `brainstorming`; `planning-artifacts/prds/` → `prd`; `planning-artifacts/architecture*` → `architecture`; `planning-artifacts/epics*` → `epics`; `planning-artifacts/ux-designs/` → `ux`; `planning-artifacts/research/` → derive from filename prefix (`technical-*` → `technical-research`, `market-*` → `market-research`, `domain-*` → `domain-research`, else `other`); `planning-artifacts/briefs/` → `product-brief`; `planning-artifacts/prfaq/` → `prfaq`; `implementation-artifacts/` → `epics` (story files are epic/user-story artifacts); `test-artifacts/` → `test-arch`; everything else → `other`
  - [ ] 4.6 Implement the upsert: for each scanned artifact, `getPrisma().artifact.upsert({ where: { repoConnectionId_path: { repoConnectionId, path } }, create: { ... }, update: { type, title, lastModifiedAt, content } })`. The `path` stored is the relative path within `_bmad-output/` (e.g., `planning-artifacts/prds/prd-bmad-easy/prd.md`), not the full repo path. The `update` payload intentionally omits `status` — see Status Semantics below; an `in-progress` status set by the Epic 3 commit-time path must be preserved across page-load syncs
  - [ ] 4.7 Implement stale cleanup: after all upserts, delete artifacts for this `repoConnectionId` whose `path` is not in the scanned set: `getPrisma().artifact.deleteMany({ where: { repoConnectionId, path: { notIn: scannedPaths } } })`. Only run this after a fully successful scan — if the scan fails partway, do not delete (partial data is better than missing data)
  - [ ] 4.8 Handle errors: 401 from any GitHub API call → throw `CredentialFailureError(401)` (caller marks credential failed). 403 → `detectGithubRateLimit` classifies it; rate limit → throw `RateLimitError`; non-rate-limit 403 → return null for that path (skip it, same as `inspectBmadSetup`). 404 for `_bmad-output/` root → return `{ success: true, artifactsUpserted: 0, artifactsDeleted: <count of existing> }` (empty `_bmad-output/` is valid per PRD FR-2). Other errors → throw

- [ ] Task 5: Create the Server Action wrapper in `apps/web/src/actions/artifacts.actions.ts` (AC: 1, 6)
  - [ ] 5.1 Create `apps/web/src/actions/artifacts.actions.ts` with `'use server'` directive. Export `syncArtifactsAction(): Promise<SyncArtifactsResult>`. Follow the exact pattern of `repository-validation.actions.ts`: call `auth()` for session, `resolveOAuthToken(session.userId)` for the token (with `capturedAt` optimistic-concurrency guard), parse the repo URL from the user's `RepoConnection` to extract `owner`/`repo`, call `syncArtifacts(accessToken, owner, repo, repoConnection.id)`. Handle `CredentialFailureError` → `markCredentialFailed` + return `NO_CREDENTIAL`. Handle `RateLimitError` → return `RATE_LIMITED`. If no `RepoConnection` exists → return `NO_REPO_CONNECTION`
  - [ ] 5.2 The repo URL parsing: read `RepoConnection.repoUrl` (stored as `https://github.com/owner/repo`), extract owner/repo via the same regex used in `repo-connection.actions.ts` (`/^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/`)
  - [ ] 5.3 This Server Action is the manual-refresh entry point (Story 2.3 will call it from the refresh button). The page-load entry point (Story 2.2) will call `syncArtifacts` directly from a Server Component after resolving auth + token + repo connection — Story 2.1 provides the lib function, Story 2.2 wires the page-load trigger

- [ ] Task 6: Write tests (AC: 1, 3, 5, 6, 7)
  - [ ] 6.1 Create `apps/web/src/lib/artifacts.spec.ts` — co-located unit tests. Mock `global.fetch` via `jest.spyOn(global, 'fetch')` using the test utilities from `apps/web/src/actions/repository-validation.test-utils.ts` (import via `'../actions/repository-validation.test-utils'` — the file lives under `actions/`, not `lib/`) (`githubDirListing`, `githubFileContent`, `github404`, `github403PrimaryRateLimit`, `mockHeaders`, `setupFetchWithOverrides`). Mock `getPrisma()` to return an object with `artifact.upsert` / `artifact.deleteMany` / `artifact.findMany` methods. Tag tests `[P0]` for AC coverage, `[P1]` for edge cases
  - [ ] 6.2 [P0] AC-1 happy path: mock `_bmad-output/` with 2 subdirectories and 3 `.md` files (one with frontmatter title, one with `# Heading` title, one with neither). Verify 3 upserts with correct type, title, status (`"completed"`), lastModifiedAt, content, and repoConnectionId. Verify the return value `{ success: true, artifactsUpserted: 3, artifactsDeleted: 0 }`
  - [ ] 6.3 [P0] AC-5 stale cleanup: mock a pre-existing artifact in Postgres whose path is not in the scan results. Verify `deleteMany` is called with `{ where: { repoConnectionId, path: { notIn: [...] } } }`
  - [ ] 6.4 [P0] AC-4 empty `_bmad-output/`: mock `_bmad-output/` as an empty directory (GitHub returns `[]`). Verify 0 upserts, return `{ success: true, artifactsUpserted: 0, artifactsDeleted: <count> }`
  - [ ] 6.5 [P0] AC-4 `_bmad-output/` missing (404): mock GitHub returning 404 for `_bmad-output/`. Verify 0 upserts, no throw, stale cleanup runs
  - [ ] 6.6 [P0] AC-6 credential failure: mock GitHub returning 401. Verify `CredentialFailureError` is thrown (caller handles marking)
  - [ ] 6.7 [P0] AC-7 rate limit: mock GitHub returning 403 with `X-RateLimit-Remaining: 0`. Verify `RateLimitError` is thrown
  - [ ] 6.8 [P1] AC-7 non-rate-limit 403: mock GitHub returning 403 without rate-limit signal for a subdirectory. Verify that subdirectory is skipped (returns null), other artifacts are still scanned
  - [ ] 6.9 [P1] Type derivation: verify the path-to-type mapping for each artifact type (brainstorming, prd, architecture, epics, ux, technical-research, market-research, domain-research, product-brief, test-arch, other)
  - [ ] 6.10 [P1] Title extraction: verify frontmatter title, `# Heading` fallback, and path-derived fallback
  - [ ] 6.11 [P1] Non-`.md` files skipped: mock a directory with `.yaml`, `.json`, `.html` files alongside `.md` files. Verify only `.md` files are upserted
  - [ ] 6.12 [P1] Recursive scanning: mock nested subdirectories (3 levels deep). Verify all `.md` files at all levels are scanned
  - [ ] 6.13 Create `apps/web/src/actions/artifacts.actions.spec.ts` — mock `auth`, `resolveOAuthToken`, `getPrisma().repoConnection.findUnique`, and `syncArtifacts`. Verify the Server Action resolves the session, token, repo connection, calls `syncArtifacts` with correct args, and handles `CredentialFailureError` / `RateLimitError` / missing repo connection

- [ ] Task 7: Verify lint, typecheck, and tests pass (AC: all)
  - [ ] 7.1 Run `yarn nx lint web` — 0 new errors/warnings (baseline: 0 errors, 11 pre-existing warnings as of 2026-07-02)
  - [ ] 7.2 Run `yarn nx typecheck web` — clean
  - [ ] 7.3 Run `yarn nx test web` — all new and existing tests pass
  - [ ] 7.4 Run `yarn nx lint database-schemas` and `yarn nx typecheck database-schemas` — clean (after `yarn nx generate database-schemas`)

## Dev Notes

### Architectural Resolution: Mirroring Lives in `apps/web`, Not `apps/agent-be`

The architecture document's source tree lists `apps/agent-be/src/artifacts/artifacts.service.ts` as the artifact mirroring boundary, and the data-flow narrative describes commit-time mirroring from the sandbox. This is the **Epic 3 commit-time path** — when an Agent commits during a Conversation, `apps/agent-be` scans the sandbox filesystem and upserts to Postgres.

Story 2.1 delivers the **page-load / manual-refresh path** (FR5), which reads from the **GitHub repository** (not the sandbox) via the GitHub Contents API. This path must live in `apps/web` because:

1. **`apps/web` never calls `apps/agent-be` server-to-server** (architecture API & Communication #5) — the page-load trigger cannot invoke an `apps/agent-be` function.
2. **Page-load and manual-refresh are synchronous operations** owned by `apps/web` Server Components and Server Actions (architecture: "apps/web Server Actions own all synchronous data operations").
3. **The data source is the GitHub repo**, not the sandbox — "Project Map and Artifact Browser are pure git reads with no sandbox dependency; they must remain functional during a Daytona outage" (architecture Cross-Cutting Concern #9).
4. **The existing GitHub API patterns** (`repository-validation.ts`), **OAuth token resolution** (`credential-health.ts`), and **Prisma access** (`prisma.ts`) already live in `apps/web`.

The two mirroring paths share the same `Artifact` Prisma model and the same upsert shape (type, title, status, lastModifiedAt, content, repoConnectionId), satisfying AC-2. The `apps/agent-be/src/artifacts/artifacts.service.ts` for commit-time sandbox→Postgres mirroring is an **Epic 3 concern** — do not create it in this story.

### Security Boundary: No `'use server'` on the Lib Function

`apps/web/src/lib/artifacts.ts` must NOT carry `'use server'`. It receives a plaintext OAuth token and performs no session check — the same security boundary as `inspectBmadSetup` in `repository-validation.ts` (see the doc comment at `repository-validation.ts:302-309`). Exposing it as a network-callable endpoint would let anonymous callers relay arbitrary tokens through the server. Only the authenticated Server Action in `artifacts.actions.ts` may call it.

### GitHub API Patterns to Reuse

The existing `apps/web/src/lib/repository-validation.ts` contains the canonical GitHub Contents API pattern. Story 2.1 reuses these helpers (Task 3 exports them):

- `fetchGithubContents(accessToken, owner, repo, path)` — handles directory listing with `Link` header pagination (caps: `MAX_CONTENT_PAGES = 10`, `MAX_CONTENT_ENTRIES = 10_000`), 401 → `CredentialFailureError`, 403 → `detectGithubRateLimit` classification (rate limit → `RateLimitError`, non-rate-limit 403 → `null`), 404 → `null`, base64 content decoding via `decodeFileContent`.
- `githubHeaders(accessToken)` — `Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.
- `detectGithubRateLimit(response, body)` — classifies primary (`X-RateLimit-Remaining: 0`) vs. secondary ("secondary rate limit" / "abuse detection") rate limits, extracts `waitHintSeconds` from `Retry-After` / `X-RateLimit-Reset`.

**Always set `AbortSignal.timeout(10_000)`** on every `fetch()` call to the GitHub API — no unbounded waits.

The commits API call for `lastModifiedAt` (`GET /repos/{owner}/{repo}/commits?path={path}&per_page=1`) is a new API call pattern not in `repository-validation.ts`. Use the same `githubHeaders` + `AbortSignal.timeout(10_000)` + 401/403/404 handling. The response is an array of commit objects; take the first one's `commit.committer.date`.

### Artifact Model Schema

Follow the existing Prisma naming conventions exactly (architecture Implementation Patterns → Naming Patterns):

- Model: `Artifact` (PascalCase singular), `@@map("artifacts")` (snake_case plural table)
- Columns: camelCase in schema, `@map("snake_case")` for SQL — e.g., `repoConnectionId @map("repo_connection_id")`, `lastModifiedAt @map("last_modified_at")`
- `id` is `@default(cuid())` (matches `User`, `OAuthCredential`, `RepoConnection`)
- Unique constraint: `@@unique([repoConnectionId, path])` — the upsert natural key
- FK: `repoConnection RepoConnection @relation(fields: [repoConnectionId], references: [id], onDelete: Cascade)` — deleting a repo connection cleans up its artifacts
- `content` is `String` (full markdown content, no `@db.Text` — Prisma maps `String` to `TEXT` in Postgres by default)
- `status` is `String @default("completed")` (not a Prisma enum — the type constraint lives in TypeScript via `ArtifactStatus`)

### Artifact Type Derivation

The `ArtifactType` is derived from the file's path within `_bmad-output/`, not from frontmatter. The mapping (Task 4.5) covers the standard BMAD `_bmad-output/` directory structure documented in CLAUDE.md's artifact vocabulary table. The `ArtifactType` union in shared-types is a TypeScript-level constraint; the Prisma column is `String` to avoid migration friction if new types are added.

### Status Semantics

- `"completed"` — the artifact is committed to the repository. All scanned artifacts default to this status in Story 2.1.
- `"in-progress"` — an active Conversation on the platform is working on this artifact. This status is set only by the Epic 3 commit-time mirroring path. Story 2.1 does not set `"in-progress"`.

Do NOT map document frontmatter `status: draft` / `status: approved` / `status: complete` to the platform artifact status. Those are document lifecycle statuses; the platform artifact status tracks Conversation association.

### Title Extraction Priority

1. YAML frontmatter `title` field (e.g., `title: "PRD: bmad-easy"`)
2. First `# Heading` line in the markdown body
3. Path-derived fallback (filename without extension, or last path segment)

### Full-Sync Strategy (Upsert + Delete)

The sync is a full sync, not an incremental one:
1. Scan all `.md` files in `_bmad-output/` recursively
2. Upsert each file (create or update by `(repoConnectionId, path)`)
3. After a successful scan, delete stale entries: `deleteMany({ where: { repoConnectionId, path: { notIn: scannedPaths } } })`

If the scan fails partway (e.g., rate limit, network error), do NOT run the delete step — partial data is better than missing data. The next successful scan will reconcile.

### Performance Considerations

- **API call count**: 1 (root listing) + N subdirectory listings + N file content fetches + N commit fetches. For a typical BMAD repo with 20-50 artifacts, this is ~60-150 API calls. The GitHub rate limit is 5,000 req/hour — sufficient for MVP.
- **Parallelism**: Use `Promise.allSettled` for parallel file content + commit fetches within a directory level. Process directories sequentially to avoid burst pressure on GitHub's secondary rate limit.
- **Caching**: The bounded in-memory cache exception (project-context.md) applies to GitHub API results. A module-level `Map` cache with FIFO eviction (max 500 entries), 120s TTL, and explicit invalidation on manual refresh is acceptable but not required for Story 2.1 — the scan only runs on page load / manual refresh, not on every request.
- **NFR-P3 (Project Map ≤ 2s)**: This NFR is Story 2.2's concern (the page-load read from Postgres). Story 2.1's scan runs before the read, but the scan itself is not bound by the 2s NFR — it runs as a background/async operation on page load. If the scan is slow, the Project Map renders the existing Postgres data (which may be stale) and the scan updates it for the next load. However, for MVP simplicity, Story 2.1 can run the scan synchronously on page load (the Server Component awaits it before rendering). Story 2.2 will decide the exact trigger mechanism.

### What NOT to Do

- Do NOT create `apps/agent-be/src/artifacts/artifacts.service.ts` — that is the Epic 3 commit-time path.
- Do NOT add `'use server'` to `apps/web/src/lib/artifacts.ts` — it receives a plaintext OAuth token.
- Do NOT map frontmatter `status` to the platform artifact status — all scanned artifacts are `"completed"`.
- Do NOT create a shared `libs/` package for the mirroring logic — the GitHub-repo path (apps/web) and the sandbox path (apps/agent-be, Epic 3) have different data sources and live in different services. A shared lib requires a genuine cross-service need (architecture: "never create a speculative `libs/utils`").
- Do NOT use `class-validator` / `class-transformer` — Zod only (project-context.md).
- Do NOT relax TypeScript strict mode with `any` or `@ts-ignore` — use `unknown` + type guards.
- Do NOT create a `__tests__/` tree — co-locate tests with source (`*.spec.ts`).
- Do NOT add comments to the code unless explicitly requested (project-context.md / CLAUDE.md).
- Do NOT cache database reads — only external API results (project-context.md).
- Do NOT modify the existing `fetchGithubContents` / `githubHeaders` / `decodeFileContent` behavior — only change their visibility (export them).

### Project Structure Notes

**New files:**
- `apps/web/src/lib/artifacts.ts` — core mirroring logic (scan GitHub `_bmad-output/`, parse, upsert to Postgres)
- `apps/web/src/lib/artifacts.spec.ts` — unit tests
- `apps/web/src/actions/artifacts.actions.ts` — Server Action wrapper for manual refresh
- `apps/web/src/actions/artifacts.actions.spec.ts` — Server Action tests
- `libs/database-schemas/src/prisma/migrations/<timestamp>_add_artifact_model/migration.sql` — Prisma migration

**Updated files:**
- `libs/database-schemas/src/prisma/schema.prisma` — add `Artifact` model, add `artifacts` relation to `RepoConnection`
- `libs/shared-types/src/artifact.types.ts` — expand `ArtifactType`, add `ArtifactStatus`, add `SyncArtifactsResult` / `SyncErrorCode`
- `apps/web/src/lib/repository-validation.ts` — export `fetchGithubContents`, `githubHeaders`, `decodeFileContent`, `GithubContentEntry`, `GithubFileContent` (visibility change only, no behavior change)

**No changes to:**
- `apps/agent-be/` (Epic 3 concern)
- Any UI component (Stories 2.2-2.6)
- Any existing Server Action behavior
- CI config
- `next.config.js`, `tailwind.config.ts`

### Previous Story Intelligence

- **Story 1.4 review (2026-07-02)**: moved validation internals out of a `'use server'` module because every export of such a module becomes a public endpoint. `artifacts.ts` is a plain lib module (safe) — same pattern as `repository-validation.ts`.
- **Story 1.6**: established `CredentialFailureError` and `markCredentialFailed` semantics; the artifacts mirroring reuses these for 401 handling. 403 is NOT a credential failure — classify it via `detectGithubRateLimit` (rate limit → `RateLimitError`) or return null (non-rate-limit 403, inaccessible path).
- **Story 1.9**: established the `apps/web/src/lib/crypto.ts` pattern for plain lib modules that handle sensitive data. `artifacts.ts` follows the same pattern: plain module, no `'use server'`, receives token as parameter, only authenticated Server Actions may call it.
- **Established conventions**: kebab-case non-component files, co-located tests, Conventional Commits (`feat` for code, `docs` for BMAD artifacts). Lint baseline: 0 errors, 11 pre-existing warnings (measured 2026-07-02) — do not add new warnings.
- **Test patterns**: mock `global.fetch` via `jest.spyOn(global, 'fetch')`, use `repository-validation.test-utils.ts` fixtures (`githubDirListing`, `githubFileContent`, `github404`, `github403PrimaryRateLimit`, `mockHeaders`). Mock `getPrisma()` to return an object with model methods. `beforeEach` / `afterEach`: `jest.clearAllMocks()` / `jest.restoreAllMocks()`.

### Git Intelligence

- Recent commits: `3260c58 feat: final epic1 fixes before self-healing workflows`, `ae6b4a6 docs: finalize epic1, with retro outcome`. Epic 1 is complete (all stories `done`). The working tree is clean — no uncommitted changes to worry about.
- `package.json` scripts follow plain yarn/nx patterns. Migrations run from `libs/database-schemas/` via `npx prisma migrate dev --config prisma.config.ts` (Prisma 7 — `prisma.config.ts` provides `datasource.url`; `--skip-generate` no longer exists per Story 1.9 debug log).

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 2.1 (lines 451-473), Epic 2 description (line 447-449), FR coverage map (lines 181-184, 192-193, 203-204), additional requirements (line 212)
- PRD: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` — FR-5 (lines 172-181), FR-6 (lines 190-201), Artifact definition (line 101), Project Map definition (line 102)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — artifacts.service.ts source tree (line 584), data boundary (line 637), data flow (line 669), graceful degradation (line 96), API & Communication #5 (line 268), Frontend Architecture (lines 270-278), naming patterns (lines 322-336), structure patterns (lines 339-342)
- Implementation readiness: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-07-03.md` — Story 2.1 migration note (line 223), remediation recommendation (line 277, 305)
- Project context: `_bmad-output/project-context.md` — GitHub API integration rules (lines 129-137), Prisma/Database rules (lines 114-120), testing rules (lines 141-177), naming conventions (lines 181-198)
- Previous story: `_bmad-output/implementation-artifacts/1-9-document-and-validate-the-kek-rotation-runbook.md` — plain lib module pattern, test patterns, migration command notes
- Implementation: `apps/web/src/lib/repository-validation.ts` (GitHub Contents API pattern), `apps/web/src/lib/credential-health.ts` (token resolution, credential failure), `apps/web/src/lib/prisma.ts` (Prisma client), `apps/web/src/actions/repository-validation.actions.ts` (Server Action pattern), `apps/web/src/actions/repository-validation.test-utils.ts` (test fixtures), `libs/database-schemas/src/prisma/schema.prisma` (existing models), `libs/database-schemas/prisma.config.ts` (Prisma 7 config), `libs/shared-types/src/artifact.types.ts` (existing artifact types)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

### Review Findings

#### Decision Needed

- [x] [Review][Decision→Patch] Root-level non-rate-limit 403 deletes ALL artifacts and reports success — **Resolved: return `NOT_FOUND` error instead of deleting.** `fetchGithubContents` returns `null` for both 404 (directory gone) and non-rate-limit 403 (access denied) on the `_bmad-output/` root. Now returns `{ error: '...', errorCode: 'NOT_FOUND' }` instead of deleting all artifacts. Preserves data on access revocation. [`apps/web/src/lib/artifacts.ts:216-221`]

- [x] [Review][Decision→Patch] Upsert `update` payload omits `status` field — **Resolved: omit `status` from update (current behavior is correct), amend Task 4.6.** Task 4.6 spec amended to remove `status` from the update payload prescription. An `in-progress` status set by Epic 3's commit-time path is preserved across page-load syncs. [`apps/web/src/lib/artifacts.ts:255-260`]

#### Patch

- [x] [Review][Patch] Per-file/subdirectory fetch failures cause data deletion via `notIn` cleanup [Critical] — **Fixed.** `scannedPaths` now initialized from `scannedFiles` before the fetch loop, so files that were listed but couldn't be fetched (403/404/transient) are preserved. Only truly missing files (not in any directory listing) get deleted. [`apps/web/src/lib/artifacts.ts:229`]

- [x] [Review][Patch] No transaction around upsert loop and `deleteMany` — partial state on mid-sync failure [Medium] — **Fixed.** Upsert loop + `deleteMany` now wrapped in `getPrisma().$transaction()`. If any upsert fails, the entire sync rolls back — no partial state. [`apps/web/src/lib/artifacts.ts:231-265`]

- [x] [Review][Patch] `markCredentialFailed` unguarded in post-sync catch [Low] — **Fixed.** Added `.catch()` to the second `markCredentialFailed` call, matching the first call's pattern. [`apps/web/src/actions/artifacts.actions.ts:65`]

- [x] [Review][Patch] YAML `#` comment in frontmatter parsed as Markdown heading [Low] — **Fixed.** `parseHeadingTitle` now strips the frontmatter block before searching for a heading. [`apps/web/src/lib/artifacts.ts:120-123`]

#### Deferred

- [x] [Review][Defer] `fetchLastCommitDate` swallows 5xx as `new Date()` instead of propagating [Low] — Non-OK responses (5xx, etc.) on the commits endpoint return `new Date()` (sync time) as `lastModifiedAt`. Spec Task 4.3 sanctions `new Date()` fallback only for 404. The current behavior is defensible (don't abort sync for a non-critical metadata field), and aborting for a transient commits-endpoint 5xx would be worse. Minor spec tension. [`apps/web/src/lib/artifacts.ts:53-55`]

- [x] [Review][Defer] Unbounded parallel API requests may trigger GitHub secondary rate limits [Medium] — All file fetches fire in one `Promise.allSettled` batch (N files × 2 requests), not per directory level as the spec's Performance Considerations recommends. For MVP repo sizes (20-50 artifacts) this is within GitHub's 5,000 req/h budget. Spec language is guidance-level, not AC-level. [`apps/web/src/lib/artifacts.ts:225-227`]

- [x] [Review][Defer] No recursion depth limit in `scanDirectory` [Low] — A pathological repo with deeply nested directories could stack-overflow. `fetchGithubContents` caps entries per directory (10,000), and BMAD repos don't have deep nesting. Not a real scenario for MVP. [`apps/web/src/lib/artifacts.ts:62-84`]

- [x] [Review][Defer] Heading inside a Markdown code block picked up as title [Low] — `parseHeadingTitle` doesn't understand fenced code blocks, so a `#` line inside a code block could be matched as a heading. A proper fix would require a markdown parser, which the spec explicitly prohibits. The regex-based approach is inherently limited. [`apps/web/src/lib/artifacts.ts:121-124`]

- [x] [Review][Defer] Path components not URL-encoded in `fetchGithubContents` calls [Low] — File/directory names with `#`, `?`, or `%` break the content fetch URL (`fetchGithubContents` doesn't encode the path). `fetchLastCommitDate` does encode via `encodeURIComponent`, creating an inconsistency. Fix requires separating the API path (encoded) from the stored path (raw). Low probability in BMAD repos; non-trivial fix. [`apps/web/src/lib/artifacts.ts:53-55`]
