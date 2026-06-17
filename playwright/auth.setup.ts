import { test as setup } from '@playwright/test';
import { authStorageInit, configureAuthSession, setAuthProvider, authGlobalInit } from '@seontechnologies/playwright-utils/auth-session';
import githubAuthProvider from './support/auth/github-auth-provider';

setup('authenticate via GitHub OAuth', async () => {
  authStorageInit();
  configureAuthSession({
    authStoragePath: process.cwd() + '/playwright/auth-sessions',
    debug: !!process.env.DEBUG_AUTH,
  });
  setAuthProvider(githubAuthProvider);
  await authGlobalInit();
});
