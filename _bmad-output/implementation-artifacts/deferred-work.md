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
