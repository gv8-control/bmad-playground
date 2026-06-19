---
title: 'Un-skip OAuth redirect scope check E2E test'
type: 'chore'
created: '2026-06-19'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** The `[P1] clicking "Sign in with GitHub" navigates toward GitHub OAuth` test was permanently skipped on the assumption it required a real GitHub OAuth App registration, leaving AC-1c (OAuth `repo` scope) without E2E coverage.

**Approach:** Auth.js constructs the redirect URL locally; `page.route()` aborts the browser navigation before it reaches GitHub. Any non-empty `AUTH_GITHUB_ID` value is sufficient, making the test runnable without a real OAuth App. A `dotenv` loader in `playwright.config.ts` surfaces `.env.local` to the Playwright runner process.

## Suggested Review Order

1. [playwright/e2e/auth/sign-in.spec.ts:119](../../../playwright/e2e/auth/sign-in.spec.ts#L119) — core test change: skip logic, route abort, tighter scope regex
2. [playwright.config.ts:1](../../../playwright.config.ts#L1) — dotenv loader addition
3. [.env.example:6](../../../.env.example#L6) — documentation: fake client ID is sufficient
