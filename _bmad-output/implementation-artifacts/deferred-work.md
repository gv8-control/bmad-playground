# Deferred Work

## Deferred from: code review of 1-1-scaffold-the-platform-monorepo-and-ci-pipeline (2026-06-18)

- `.claude/settings.json` — leading `*` wildcard in `Bash(python3 *_bmad/scripts/*)` removes the path anchor present in the original rule; any path ending in `_bmad/scripts/` is now accepted, widening attack surface beyond the intended `_bmad/` directory.
- `ProvisionParams.repoUrl` and `credential` never passed in tests — all test calls use `{ conversationId } as any`, bypassing type safety. Real integration coverage of these fields deferred to the story that implements the real SandboxService.
- `credential` field flows as a bare string with no format documentation, no logging guard, and no expiry awareness. Mitigate before real credential handling is wired in (Story 1.2 / 3.x range).
- `SandboxInfo.provisionedAt` is typed `?: Date` but no consumer null-guards it. Any idle-timeout or TTL logic that reads this field will silently skip eviction on undefined, producing zombie sandboxes. Fix when idle-timeout logic is implemented.
- `sandboxId: fake-sandbox-${Date.now()}` — two provisions in the same millisecond produce the same ID and silently overwrite in the Map. Low risk at `maxWorkers: 1` but will bite if worker count is raised. Switch to `crypto.randomUUID()` or similar before parallelising tests.
- `overrideProviders` in `test-module-builder.ts` silently drops entries where `useValue` is explicitly `undefined` due to `!== undefined` guard. Fix when a test needs to override a provider to `undefined`.

## Deferred from: re-review of 1-1-scaffold-the-platform-monorepo-and-ci-pipeline (2026-06-18)

- `libs/shared-types/src/sandbox.constants.ts` re-exports `SANDBOX_SERVICE` from `sandbox.interface.ts`, and both are re-exported via `index.ts` — redundant but functional since both traces resolve to the same declaration.
- Nx generator stub files `libs/shared-types/src/lib/shared-types.ts` and `libs/database-schemas/src/lib/database-schemas.ts` are not part of the public API and serve no purpose beyond the auto-generated spec files. Remove when cleaning up generator residue.
- `apps/web/src/app/page.tsx` is the Nx default welcome template rather than a placeholder redirect. Replace when the first real page is implemented.
- Inter and JetBrains Mono fonts are declared in `tailwind.config.ts` theme but never loaded (no `<link>` in layout or `@import` in CSS). Add font loading when the first styled component is built.
- `libs/database-schemas/src/index.ts` imports from `./generated/client` which does not exist on a clean checkout until `prisma generate` runs. The `dependsOn: ["generate"]` on `lint` and `typecheck` targets mitigates this for Nx-driven workflows, but a bare `tsc` or IDE cold-start will show import errors until generate is run.

## Deferred from: code review of 1-3-connect-a-repository-by-url (2026-06-19)

- DEK not zeroed after use in `decryptToken` — the plaintext DEK remains on the heap until GC; standard practice is `dek.fill(0)` in a `finally` block.
- Org-restriction detection via heuristic GitHub API message substring matching — fragile if GitHub changes error message wording. Revisit when a reliable GitHub header is documented.
- `data.permissions` absent or degraded for organization repos accessed via team membership — results in misleading `INSUFFICIENT_PERMISSION` error; documented in Dev Notes #8. Mitigate in Story 1.6 (credential failure recovery).
- `callbackUrl` in `auth.config.ts` set to `pathname` only — query string parameters stripped on auth redirect; no protected pages currently use query params.
- `/api/internal/test/repo-connections/[id]` DELETE has no Prisma P2025 error handling — non-existent ID throws 500, causing misleading test teardown failures.
- `syntheticSession` in `playwright/auth.setup.ts` mints real JWT tokens from `AUTH_SECRET` — if `AUTH_SECRET` leaks from CI, arbitrary sessions can be forged; inherent to synthetic session architecture.

## Deferred from: code review of 1-2-sign-in-with-github (2026-06-18)

- No database migration infrastructure — no `prisma/migrations` directory or `migrate` script; schema must be applied manually via `prisma db push`.
- `email` column has no uniqueness constraint or index on the `User` model — same email can appear on multiple rows without constraint.
- `next-auth` beta pinned with `^` range — `^5.0.0-beta.31` allows automatic upgrades to future beta releases with potential breaking changes.
- `active` and `lastActiveAt` fields in the `User` model are never updated by the application — fields exist in schema but have no writer until a future story implements them.
- No unit/integration test coverage for AC-2 session persistence (8h maxAge) — requires E2E test coverage in a future story.
- Non-GitHub provider path not handled — if a second OAuth provider is added, `token.userId` is never set for it and `session.userId` will be absent for those users.
- Prisma singleton never resets on stale DB connection — known limitation of the global singleton pattern in Next.js; mitigate when connection resilience is required.
- Static assets in `/public/` beyond `favicon.ico` not excluded from middleware matcher — theoretical concern; no non-favicon public assets currently exist.
