/**
 * ATDD — Story 1.2: Sign In with GitHub
 * These tests cover AC-1 through AC-4 of Story 1.2.
 *
 * Tests that require real GitHub OAuth credentials remain skipped:
 *   - [P1] OAuth initiation scope check (needs AUTH_GITHUB_ID)
 */

import { test, expect } from '../../support/merged-fixtures';

// ─── Unauthenticated access control (AC-4, AC-1a) ────────────────────────────

test.describe('Story 1.2 — unauthenticated access control', () => {
  test('[P0] visiting / redirects unauthenticated user to /sign-in', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/');
      await expect(page).toHaveURL(/\/sign-in/);
    } finally {
      await context.close();
    }
  });

  test('[P0] visiting a protected route redirects with callbackUrl', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard/);
    } finally {
      await context.close();
    }
  });

  test('[P0] visiting any unauthenticated page never surfaces app content', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      for (const path of ['/conversations', '/settings', '/artifacts']) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/sign-in/);
      }
    } finally {
      await context.close();
    }
  });
});

// ─── Sign-in page UI (AC-1b) ──────────────────────────────────────────────────

test.describe('Story 1.2 — sign-in page layout', () => {
  test('[P0] sign-in page renders with "Sign in with GitHub" as sole interactive element', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/sign-in');

      // Sole interactive element: the GitHub button
      await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();

      // No other buttons, links, or text inputs on the page
      await expect(page.getByRole('button')).toHaveCount(1);
      await expect(page.getByRole('textbox')).toHaveCount(0);
      await expect(page.getByRole('link')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('[P1] sign-in page shows no error by default', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/sign-in');
      await expect(page.getByRole('alert')).not.toBeVisible();
    } finally {
      await context.close();
    }
  });
});

// ─── OAuth error state (AC-3) ─────────────────────────────────────────────────

test.describe('Story 1.2 — OAuth error state', () => {
  test('[P1] ?error query param shows inline error below re-enabled button', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/sign-in?error=OAuthCallback');

      const errorMessage = page.getByRole('alert');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText('Sign-in failed. Try again or contact support.');

      // Button is still enabled (not disabled)
      await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
    } finally {
      await context.close();
    }
  });

  test('[P2] any error value triggers the same inline error message', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/sign-in?error=AccessDenied');
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('Sign-in failed.');
    } finally {
      await context.close();
    }
  });
});

// ─── OAuth initiation (AC-1c) ─────────────────────────────────────────────────

test.describe('Story 1.2 — GitHub OAuth initiation', () => {
  // AUTH_GITHUB_ID can be any non-empty string — Auth.js embeds it as `client_id` without
  // validating it with GitHub. The route abort below prevents the browser from ever reaching
  // GitHub, so no real OAuth App registration is required.
  test('[P1] clicking "Sign in with GitHub" navigates toward GitHub OAuth', async ({ browser }) => {
    test.skip(
      !process.env.AUTH_GITHUB_ID,
      'Set AUTH_GITHUB_ID to any non-empty value to enable (a real GitHub OAuth App is not required)',
    );
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/sign-in');

      // Abort navigation to GitHub — keeps the test self-contained and offline-friendly
      await page.route('**/github.com/login/oauth/**', (route) => route.abort());

      // Intercept the outgoing navigation to GitHub
      const [githubRequest] = await Promise.all([
        page.waitForRequest((req) => req.url().includes('github.com/login/oauth/authorize'), { timeout: 15_000 }),
        page.getByRole('button', { name: 'Sign in with GitHub' }).click(),
      ]);

      // Verify repo scope is included in the OAuth authorization URL
      expect(githubRequest.url()).toMatch(/scope=.*repo/);
    } finally {
      await context.close();
    }
  });
});

// ─── Session persistence (AC-2) ───────────────────────────────────────────────

test.describe('Story 1.2 — session persistence', () => {
  test('[P0] authenticated session survives page reload', async ({ page }) => {
    await page.goto('/');
    // Authenticated users are not redirected to /sign-in
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.reload();

    // Session cookie restored from storage — still authenticated
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  test('[P0] session cookie maxAge is at least 8 hours', async ({ page, context }) => {
    await page.goto('/');
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === 'authjs.session-token');

    expect(sessionCookie).toBeDefined();

    // Auth.js sets maxAge to 8 * 60 * 60 = 28800 seconds
    const eightHoursFromNow = Date.now() / 1000 + 8 * 60 * 60 - 60; // -60s tolerance
    expect(sessionCookie!.expires).toBeGreaterThan(eightHoursFromNow);
  });
});
