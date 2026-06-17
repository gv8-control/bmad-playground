import { mergeTests } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as authFixture } from '@seontechnologies/playwright-utils/auth-session/fixtures';
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';
import { test as logFixture } from '@seontechnologies/playwright-utils/log/fixtures';
import { test as networkErrorMonitorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
import { setAuthProvider } from '@seontechnologies/playwright-utils/auth-session';

import githubAuthProvider from './auth/github-auth-provider';
import { test as customFixtures } from './custom-fixtures';

setAuthProvider(githubAuthProvider);

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
