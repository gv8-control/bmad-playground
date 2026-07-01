---
title: 'Fix Turbopack Build Root and Hidden Build Errors'
type: 'bugfix'
created: '2026-06-30'
status: 'done'
route: 'one-shot'
baseline_commit: '134bef67c712748ff495710ec6008417ffc41b06'
---

# Fix Turbopack Build Root and Hidden Build Errors

## Intent

**Problem:** `pnpm exec nx build web` failed with a Turbopack workspace root detection error ("couldn't find the Next.js package from project directory"). Once that was fixed, three more pre-existing errors surfaced: sync functions exported from a `'use server'` file (Next.js 16 requires async), a missing Prisma generated client, and TypeScript type errors in the validation code.

**Approach:** Set `turbopack.root` in `next.config.js` to the monorepo workspace root. Then fix the cascading errors: make `invalidateValidationCache`/`clearValidationCache` async, wire `database-schemas:generate` as a build dependency of `web:build`, fix the `makeValidationError` meta parameter type and spread order, and replace `!validation.valid` with `'code' in validation` for proper union narrowing.

## Suggested Review Order

**Build config**

- Turbopack workspace root fix — the entry point that unblocked the build
  [`next.config.js:8`](../../apps/web/next.config.js#L8)

- Build dependency wiring — ensures `database-schemas:generate` runs before `web:build` on clean checkout
  [`project.json:9`](../../apps/web/project.json#L9)

**Server Action async fix**

- Made `invalidateValidationCache` async (Next.js 16 requires all `'use server'` exports to be async)
  [`repository-validation.actions.ts:255`](../../apps/web/src/actions/repository-validation.actions.ts#L255)

- Made `clearValidationCache` async (same requirement)
  [`repository-validation.actions.ts:265`](../../apps/web/src/actions/repository-validation.actions.ts#L265)

- Added `await` to caller in `connectRepository`
  [`repo-connection.actions.ts:153`](../../apps/web/src/actions/repo-connection.actions.ts#L153)

**Type fixes**

- Changed `!validation.valid` to `'code' in validation` for proper union narrowing (`ValidationError` has no `valid` field)
  [`repo-connection.actions.ts:132`](../../apps/web/src/actions/repo-connection.actions.ts#L132)

- Fixed `makeValidationError` meta parameter type to `Omit<..., 'documentationLink'>` and reversed spread order so `BMAD_DOCUMENTATION_LINK` isn't overwritten
  [`repository-validation.actions.ts:141`](../../apps/web/src/actions/repository-validation.actions.ts#L141)

**Test updates**

- Added `await` to `clearValidationCache` and `invalidateValidationCache` calls in tests
  [`repository-validation.actions.spec.ts:492`](../../apps/web/src/actions/repository-validation.actions.spec.ts#L492)
