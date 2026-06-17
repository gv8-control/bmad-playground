import { type AuthProvider } from '@seontechnologies/playwright-utils/auth-session';
import * as OTPAuth from 'otpauth';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is required for E2E auth`);
  return value;
};

const githubAuthProvider: AuthProvider = {
  getEnvironment: (options) => options.environment ?? 'local',
  getUserIdentifier: (options) => options.userIdentifier ?? 'default',

  extractToken: (storageState) => {
    // Auth.js v5 stores the session as a cookie named 'authjs.session-token'
    const cookie = storageState.cookies?.find((c) => c.name === 'authjs.session-token');
    return cookie?.value;
  },

  isTokenExpired: (storageState) => {
    const cookie = storageState.cookies?.find((c) => c.name === 'authjs.session-token');
    if (!cookie) return true;
    // Auth.js session cookies carry an expires timestamp
    const expiresMs = cookie.expires * 1000;
    return Date.now() > expiresMs - 60_000; // 1-minute buffer
  },

  manageAuthToken: async (request, options, page) => {
    if (!page) throw new Error('githubAuthProvider requires a browser page context');

    const username = required('TEST_GITHUB_USERNAME');
    const password = required('TEST_GITHUB_PASSWORD');
    const otpSecret = process.env.TEST_GITHUB_OTP_SECRET;
    const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

    // Navigate to the app sign-in page and trigger GitHub OAuth
    await page.goto(`${baseUrl}/auth/signin`);
    await page.getByRole('button', { name: /sign in with github/i }).click();

    // GitHub OAuth login form
    await page.getByLabel('Username or email address').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Handle 2FA if configured
    if (otpSecret && (await page.getByLabel(/authentication code/i).isVisible({ timeout: 5_000 }).catch(() => false))) {
      const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(otpSecret) });
      await page.getByLabel(/authentication code/i).fill(totp.generate());
      await page.getByRole('button', { name: /verify/i }).click();
    }

    // Handle GitHub OAuth authorization screen (first-time only)
    const authorizeBtn = page.getByRole('button', { name: /authorize/i });
    if (await authorizeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await authorizeBtn.click();
    }

    // Wait for redirect back to the app
    await page.waitForURL(`${baseUrl}/**`, { timeout: 30_000 });

    // Capture and return the browser storage state (Auth.js session cookie)
    return page.context().storageState();
  },
};

export default githubAuthProvider;
