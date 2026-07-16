import { mergeTests, test as base } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import {
  createAuthFixtures,
  setAuthProvider,
  getStorageStatePath,
  type AuthFixtures,
  type AuthOptions,
} from '@seontechnologies/playwright-utils/auth-session';
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';
import { test as logFixture } from '@seontechnologies/playwright-utils/log/fixtures';
import { test as networkErrorMonitorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
import { existsSync } from 'fs';

import githubAuthProvider from './auth/github-auth-provider';
import { test as consoleErrorGuard } from './console-error-guard';
import { test as customFixtures } from './custom-fixtures';

setAuthProvider(githubAuthProvider);
// createAuthFixtures() overrides the built-in `context` fixture with auth-aware logic.
// The cast is required because TypeScript cannot infer that `authOptions` and
// `authSessionEnabled` (declared in the same extend call) satisfy the fixture dependency type.
const authFixture = base.extend<AuthFixtures>(createAuthFixtures() as any);

// Override authOptions to select a per-worker storage state based on
// workerIndex. Each worker gets its own userIdentifier (worker-0, worker-1, ...)
// which maps to .auth/{env}/worker-{i}/storage-state.json — created by
// auth.setup.ts. Falls back to 'default' when the per-worker file doesn't
// exist (e.g. the real OAuth flow only creates the default storage state).
//
// This is the core of per-worker user isolation: the `context` fixture (from
// createAuthFixtures) uses authOptions to resolve the storage state path via
// getStorageStatePath(authOptions). By setting userIdentifier to 'worker-{i}',
// each worker loads a different storage state — a different synthetic session
// for a different test user — so their RepoConnection rows never collide.
const authFixtureWithWorkerIsolation = authFixture.extend<AuthFixtures>({
  authOptions: async ({}, use, testInfo) => {
    const environment = process.env.TEST_ENV || 'local';
    const workerIdentifier = `worker-${testInfo.workerIndex}`;
    const workerStoragePath = getStorageStatePath({
      environment,
      userIdentifier: workerIdentifier,
    });
    // Fall back to 'default' when the per-worker storage state doesn't exist.
    // This happens for the real OAuth flow (which only creates the default
    // storage state) or when auth.setup.ts hasn't been updated.
    const userIdentifier = existsSync(workerStoragePath) ? workerIdentifier : 'default';
    await use({ environment, userIdentifier } as AuthOptions);
  },
});

export const test = mergeTests(
  apiRequestFixture,
  authFixtureWithWorkerIsolation,
  consoleErrorGuard,
  interceptFixture,
  recurseFixture,
  logFixture,
  networkErrorMonitorFixture,
  customFixtures,
);

export { expect } from '@playwright/test';
