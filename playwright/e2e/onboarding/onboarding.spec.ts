/**
 * ATDD — Story 1.3: Connect a Repository by URL
 * E2E tests for the /onboarding flow.
 * Covers AC-1 (URL-only form, no token field), AC-3 (success → /project-map),
 * AC-4 (descriptive per-cause inline errors).
 *
 * Most tests use the synthetic session seeded by auth.setup.ts (AUTH_SECRET only).
 * Tests that require real GitHub credentials or server-side API mocking remain skipped.
 */

import { test, expect } from '../../support/merged-fixtures';

// ─── Unauthenticated access guard ────────────────────────────────────────────

test.describe('Story 1.3 — unauthenticated access to /onboarding', () => {
  test('[P0] unauthenticated user visiting /onboarding is redirected to /sign-in', async ({ browser }) => {
    const context = await browser.newContext(); // no stored auth state
    const page = await context.newPage();
    try {
      await page.goto('/onboarding');
      await expect(page).toHaveURL(/\/sign-in/);
    } finally {
      await context.close();
    }
  });
});

// ─── Onboarding page layout (AC-1, UX-DR14) ──────────────────────────────────

test.describe('Story 1.3 — onboarding page layout', () => {
  test(
    '[P0] authenticated user with no connected repo sees the Repository URL input as the sole text input (AC-1)',
    async ({ page }) => {
      await page.goto('/onboarding');

      // Exactly one text input — the URL field
      await expect(page.getByLabel(/repository url/i)).toBeVisible();
      await expect(page.getByRole('textbox')).toHaveCount(1);

      // No access-token, PAT, or password field (DL-7 supersedes EXPERIENCE.md PAT flow)
      await expect(page.getByLabel(/token|access.token|pat/i)).not.toBeVisible();
    },
  );

  test(
    '[P0] "Connect repository" is the only button on the onboarding page (AC-1)',
    async ({ page }) => {
      await page.goto('/onboarding');
      await expect(page.getByRole('button', { name: /connect repository/i })).toBeVisible();
      await expect(page.getByRole('button')).toHaveCount(1);
    },
  );

  test(
    '[P1] connect button is disabled when the URL input is empty',
    async ({ page }) => {
      await page.goto('/onboarding');
      await expect(page.getByRole('button', { name: /connect repository/i })).toBeDisabled();
    },
  );

  test(
    '[P0] page shows no error message on initial load',
    async ({ page }) => {
      await page.goto('/onboarding');
      await expect(page.getByRole('alert')).not.toBeVisible();
    },
  );
});

// ─── Redirect when already connected (AC-3 guard) ────────────────────────────

test.describe('Story 1.3 — skip onboarding when already connected', () => {
  test(
    '[P0] authenticated user who already has a RepoConnection is redirected to /project-map',
    async ({ page, withRepoConnection: _ }) => {
      await page.goto('/onboarding');
      await expect(page).toHaveURL('/project-map');
    },
  );
});

// ─── Root redirect routing (AC-1, Task 6) ─────────────────────────────────────

test.describe('Story 1.3 — root page redirect logic', () => {
  test(
    '[P0] authenticated user with no RepoConnection visiting / is redirected to /onboarding',
    async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL('/onboarding');
    },
  );

  test(
    '[P0] authenticated user with an existing RepoConnection visiting / is redirected to /project-map',
    async ({ page, withRepoConnection: _ }) => {
      await page.goto('/');
      await expect(page).toHaveURL('/project-map');
    },
  );
});

// ─── Pending / validating state (UX-DR14) ─────────────────────────────────────

test.describe('Story 1.3 — validating state', () => {
  test.skip(
    '[P1] "Validating…" appears on the button immediately after form submission',
    async ({ page }) => {
      await page.goto('/onboarding');

      // Delay the Server Action response so we can observe the pending state
      await page.route('**/onboarding**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.continue();
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/a/b');
      await page.getByRole('button', { name: /connect repository/i }).click();

      await expect(page.getByRole('button', { name: /validating/i })).toBeVisible();
    },
  );
});

// ─── Error states (AC-4) ──────────────────────────────────────────────────────

test.describe('Story 1.3 — inline error display (AC-4)', () => {
  test.skip(
    '[P0] submitting a non-existent repository URL shows a "not found" error (AC-4)',
    async ({ page }) => {
      await page.goto('/onboarding');
      await page.getByLabel(/repository url/i).fill(
        'https://github.com/nonexistent-org-xyz-12345/nonexistent-repo-xyz-12345',
      );
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/not found/i);
    },
  );

  test.skip(
    '[P0] submitting a repo the user cannot write to shows an "insufficient permission" error (AC-4)',
    async ({ page }) => {
      await page.goto('/onboarding');
      await page.getByLabel(/repository url/i).fill('https://github.com/read-only-org/read-only-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/write access/i);
    },
  );

  test.skip(
    '[P1] org OAuth App restriction error explicitly names the org cause — not a generic message (AC-4)',
    async ({ page }) => {
      // Requires a test repo in an org with OAuth App access restrictions enabled
      await page.goto('/onboarding');
      await page.getByLabel(/repository url/i).fill('https://github.com/restricted-org-test/some-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/organization/i);
      await expect(alert).not.toContainText(/couldn.t connect|something went wrong/i);
    },
  );
});

// ─── Successful connection (AC-3) ─────────────────────────────────────────────

test.describe('Story 1.3 — successful repository connection (AC-3)', () => {
  test.skip(
    '[P0] submitting a valid URL with write access redirects to /project-map (AC-3)',
    async ({ page }) => {
      await page.goto('/onboarding');
      // Use a real repo the test user has write access to (configured in test env)
      const repoUrl = process.env.TEST_REPO_URL ?? 'https://github.com/test-org/test-repo';
      await page.getByLabel(/repository url/i).fill(repoUrl);
      await page.getByRole('button', { name: /connect repository/i }).click();

      // After successful connection the Server Action redirects to /project-map
      await expect(page).toHaveURL('/project-map', { timeout: 15_000 });
    },
  );

  test.skip(
    '[P1] encrypted token is never visible in the browser — response body check (AC-3)',
    async ({ page }) => {
      const responses: string[] = [];

      page.on('response', async (response) => {
        try {
          const text = await response.text();
          responses.push(text);
        } catch {
          // ignore binary/streaming responses
        }
      });

      await page.goto('/onboarding');
      const repoUrl = process.env.TEST_REPO_URL ?? 'https://github.com/test-org/test-repo';
      await page.getByLabel(/repository url/i).fill(repoUrl);
      await page.getByRole('button', { name: /connect repository/i }).click();
      await expect(page).toHaveURL('/project-map', { timeout: 15_000 });

      // No response body should contain the raw OAuth access token pattern
      const combined = responses.join('\n');
      expect(combined).not.toMatch(/gho_[A-Za-z0-9]+/);
    },
  );
});
