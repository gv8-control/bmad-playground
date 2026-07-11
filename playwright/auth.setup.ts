import { test as setup, type Page, type APIRequestContext } from '@playwright/test';
import { authStorageInit, getStorageStatePath } from '@seontechnologies/playwright-utils/auth-session';
import { encode } from 'next-auth/jwt';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import * as OTPAuth from 'otpauth';

// Create the directory and empty storage state file before any test worker starts.
// No explicit environment — defaults to process.env.TEST_ENV || 'local', which
// matches the @seontechnologies/playwright-utils fixtures that override
// storageState in the browser context. In CI (TEST_ENV=ci), this creates
// .auth/ci/default/storage-state.json; locally it creates
// .auth/local/default/storage-state.json. Both the setup test and the fixtures
// must use the same path, which requires using the same environment resolution.
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
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  if (otpSecret && (await page.getByLabel(/authentication code|verification code/i).isVisible({ timeout: 10_000 }).catch(() => false))) {
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(otpSecret) });
    await page.getByLabel(/authentication code|verification code/i).fill(totp.generate());
    // GitHub's 2FA form auto-submits on 6 digits — no explicit Verify click needed.
    // Clicking Verify times out because the page navigates away before the click resolves.
  }

  const authorizeBtn = page.getByRole('button', { name: /authorize/i });
  if (await authorizeBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
    // GitHub disables the authorize button via JS for a moment after page load.
    // Force-enable it before clicking, otherwise click() waits forever for it to become enabled.
    await authorizeBtn.evaluate((el) => {
      (el as HTMLButtonElement).disabled = false;
    });
    await authorizeBtn.click({ force: true, noWaitAfter: true });
  }

  // Wait for redirect back to the app — but NOT to /sign-in (which would
  // indicate an OAuth callback failure). A function predicate excludes the
  // sign-in page so a silent OAuth error causes a timeout instead of a false
  // pass. Without this, waitForURL(`${BASE_URL}/**`) matches /sign-in?error=...
  // immediately (the callback already redirected there), storageState saves
  // no session cookie, and the setup test passes without ever detecting the
  // failure.
  await page.waitForURL(
    (url) => url.origin === BASE_URL && !url.pathname.startsWith('/sign-in'),
    { timeout: 30_000 },
  );

  // Verify the OAuth flow actually produced a valid session. If the jwt
  // callback in auth.ts threw (e.g., CREDENTIAL_ENCRYPTION_KEK missing,
  // Prisma error), Auth.js redirects to /sign-in?error=... with no session
  // cookie. The waitForURL predicate above prevents that redirect from
  // matching, so reaching this line means we're on a real app page. But
  // we still verify the session explicitly to catch any edge case where
  // the cookie is present but invalid.
  const sessionRes = await page.request.get(`${BASE_URL}/api/auth/session`);
  if (!sessionRes.ok()) {
    throw new Error(
      `session check failed: ${sessionRes.status()} ${await sessionRes.text()}`,
    );
  }
  const session = (await sessionRes.json()) as { userId?: string };
  if (!session.userId) {
    throw new Error(
      'OAuth flow completed but session has no userId — the jwt callback may have failed. ' +
      'Check that CREDENTIAL_ENCRYPTION_KEK is set and the database is accessible.',
    );
  }

  // Save storage state only after confirming the session is valid, so the
  // file always contains the authjs.session-token cookie.
  // No explicit environment — defaults to process.env.TEST_ENV || 'local',
  // matching the fixtures that load this file in the test project.
  const storagePath = getStorageStatePath();
  await page.context().storageState({ path: storagePath });

  // Read the file back from disk and verify it contains the session cookie.
  // The browser context check above verifies the cookie exists in memory;
  // this check verifies it was actually persisted to the file that the test
  // project will load. Catches file system issues (wrong path, permissions,
  // race conditions) that would silently produce an empty or stale file.
  const fileContent = readFileSync(storagePath, 'utf8');
  const parsedState = JSON.parse(fileContent) as { cookies?: { name: string }[] };
  const fileHasSessionCookie = parsedState.cookies?.some(
    (c) => c.name === 'authjs.session-token',
  );
  if (!fileHasSessionCookie) {
    throw new Error(
      `Storage state file at ${storagePath} does not contain authjs.session-token cookie. ` +
      `File has ${parsedState.cookies?.length ?? 0} cookies. ` +
      `Cookie names: ${parsedState.cookies?.map((c) => c.name).join(', ') ?? 'none'}`,
    );
  }

  // Log cookie details for diagnostics — if the test project still can't
  // authenticate, the domain/sameSite/secure attributes are likely the cause.
  const sessionCookie = (JSON.parse(fileContent) as { cookies: Record<string, unknown>[] }).cookies.find(
    (c) => c.name === 'authjs.session-token',
  );
  console.log(
    `[auth.setup] Session cookie saved: domain=${sessionCookie?.domain} path=${sessionCookie?.path} ` +
    `secure=${sessionCookie?.secure} sameSite=${sessionCookie?.sameSite} ` +
    `httpOnly=${sessionCookie?.httpOnly} expires=${sessionCookie?.expires}`,
  );

  // Seed a RepoConnection so /conversations/new doesn't redirect to /onboarding.
  // The Auth.js jwt callback (auth.ts:25-81) already upserted the user + stored
  // the encrypted OAuth access_token during the callback. We just need a
  // RepoConnection row pointing to a real repo the token can clone.
  // Uses page.request (shares the page's session cookie) to call the test API,
  // which requires TEST_ENV on the server.
  const repoUrl = process.env.TEST_GITHUB_REPO_URL;
  if (repoUrl) {
    const connRes = await page.request.post(
      `${BASE_URL}/api/internal/test/repo-connections`,
      { data: { userId: session.userId, repoUrl } },
    );
    if (!connRes.ok()) {
      throw new Error(
        `repo-connections seed failed: ${connRes.status()} ${await connRes.text()}`,
      );
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
  // No explicit environment — defaults to process.env.TEST_ENV || 'local',
  // matching the fixtures that load this file in the test project.
  const storagePath = getStorageStatePath();
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
