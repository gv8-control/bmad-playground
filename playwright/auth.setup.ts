import { test as setup } from '@playwright/test';
import { authStorageInit, getStorageStatePath } from '@seontechnologies/playwright-utils/auth-session';
import * as OTPAuth from 'otpauth';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is required for E2E auth`);
  return value;
};

// Create the directory and empty storage state file before any test worker starts.
authStorageInit();

setup('authenticate via GitHub OAuth', async ({ page }) => {
  const username = required('TEST_GITHUB_USERNAME');
  const password = required('TEST_GITHUB_PASSWORD');
  const otpSecret = process.env.TEST_GITHUB_OTP_SECRET;
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  await page.goto(`${baseUrl}/auth/signin`);
  await page.getByRole('button', { name: /sign in with github/i }).click();

  await page.getByLabel('Username or email address').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  if (otpSecret && (await page.getByLabel(/authentication code/i).isVisible({ timeout: 5_000 }).catch(() => false))) {
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(otpSecret) });
    await page.getByLabel(/authentication code/i).fill(totp.generate());
    await page.getByRole('button', { name: /verify/i }).click();
  }

  const authorizeBtn = page.getByRole('button', { name: /authorize/i });
  if (await authorizeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await authorizeBtn.click();
  }

  await page.waitForURL(`${baseUrl}/**`, { timeout: 30_000 });

  const storagePath = getStorageStatePath({ environment: 'local', userIdentifier: 'default' });
  await page.context().storageState({ path: storagePath });
});
