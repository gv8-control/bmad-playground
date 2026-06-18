import { mergeTests, test as base } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { createAuthFixtures, setAuthProvider, type AuthFixtures } from '@seontechnologies/playwright-utils/auth-session';
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';
import { test as logFixture } from '@seontechnologies/playwright-utils/log/fixtures';
import { test as networkErrorMonitorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';

import githubAuthProvider from './auth/github-auth-provider';
import { test as customFixtures } from './custom-fixtures';

setAuthProvider(githubAuthProvider);
// createAuthFixtures() overrides the built-in `context` fixture with auth-aware logic.
// The cast is required because TypeScript cannot infer that `authOptions` and
// `authSessionEnabled` (declared in the same extend call) satisfy the fixture dependency type.
const authFixture = base.extend<AuthFixtures>(createAuthFixtures() as any);

export const test = mergeTests(
  apiRequestFixture,
  authFixture,
  interceptFixture,
  recurseFixture,
  logFixture,
  networkErrorMonitorFixture,
  customFixtures,
);

export { expect } from '@playwright/test';
