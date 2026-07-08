import { test as setup, type Page, type APIRequestContext } from '@playwright/test';
import { authStorageInit, getStorageStatePath } from '@seontechnologies/playwright-utils/auth-session';
import { encode } from 'next-auth/jwt';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import * as OTPAuth from 'otpauth';

// Create the directory and empty storage state file before any test worker starts.
authStorageInit();

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// Fixed githubId used for the synthetic E2E test user — stable across runs so that
// upsert works correctly without accumulating duplicate rows.
const E2E_GITHUB_ID = 'e2e-test-default-99999';

setup('authenticate', async ({ page, request }) => {
  if (process.env.TEST_GITHUB_USERNAME && process.env.TEST_GITHUB_PASSWORD) {
    await realOAuthFlow({ page });
  } else {
    await syntheticSession({ request });
  }
});

async function realOAuthFlow({ page }: { page: Page }) {
  const username = process.env.TEST_GITHUB_USERNAME!;
  const password = process.env.TEST_GITHUB_PASSWORD!;
  const otpSecret = process.env.TEST_GITHUB_OTP_SECRET;

  await page.goto(`${BASE_URL}/sign-in`);
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

  await page.waitForURL(`${BASE_URL}/**`, { timeout: 30_000 });

  const storagePath = getStorageStatePath({ environment: 'local', userIdentifier: 'default' });
  await page.context().storageState({ path: storagePath });

  // Seed a RepoConnection so /conversations/new doesn't redirect to /onboarding.
  // The Auth.js jwt callback (auth.ts:25-81) already upserted the user + stored
  // the encrypted OAuth access_token during the callback. We just need a
  // RepoConnection row pointing to a real repo the token can clone.
  // Uses page.request (shares the page's session cookie) to call the test API,
  // which requires TEST_ENV on the server.
  const repoUrl = process.env.TEST_GITHUB_REPO_URL;
  if (repoUrl) {
    // /api/auth/session returns { userId } via the session callback (auth.ts:82-87).
    const sessionRes = await page.request.get(`${BASE_URL}/api/auth/session`);
    if (sessionRes.ok()) {
      const session = (await sessionRes.json()) as { userId?: string };
      if (session.userId) {
        const connRes = await page.request.post(`${BASE_URL}/api/internal/test/repo-connections`, {
          data: { userId: session.userId, repoUrl },
        });
        if (!connRes.ok()) {
          throw new Error(`repo-connections seed failed: ${connRes.status()} ${await connRes.text()}`);
        }
      }
    }
  }
}

async function syntheticSession({ request }: { request: APIRequestContext }) {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) throw new Error('AUTH_SECRET is required for synthetic E2E session seeding');

  // Upsert a stable test user in the DB.
  const seedResponse = await request.post(`${BASE_URL}/api/internal/test/seed-user`, {
    data: { githubId: E2E_GITHUB_ID, githubLogin: 'e2e-test-user', name: 'E2E Test User' },
  });
  if (!seedResponse.ok()) {
    throw new Error(`seed-user failed: ${seedResponse.status()} ${await seedResponse.text()}`);
  }
  const { userId } = (await seedResponse.json()) as { userId: string };

  // Build a signed Auth.js JWT that the middleware will accept as a valid session.
  const now = Math.floor(Date.now() / 1000);
  const token = await encode({
    token: {
      sub: userId,
      name: 'E2E Test User',
      email: 'e2e-test@example.com',
      userId,
      iat: now,
      exp: now + 8 * 60 * 60,
      jti: `e2e-${Date.now()}`,
    },
    secret: authSecret,
    // Auth.js v5 uses the cookie name as the JWE salt.
    salt: 'authjs.session-token',
  });

  // Write the storage state so the chromium project can pick it up.
  const storagePath = getStorageStatePath({ environment: 'local', userIdentifier: 'default' });
  mkdirSync(dirname(storagePath), { recursive: true });
  writeFileSync(
    storagePath,
    JSON.stringify({
      cookies: [
        {
          name: 'authjs.session-token',
          value: token,
          domain: 'localhost',
          path: '/',
          expires: now + 8 * 60 * 60,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    }),
  );
}
