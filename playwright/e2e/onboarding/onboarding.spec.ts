/**
 * ATDD — Story 1.3: Connect a Repository by URL
 * E2E tests for the /onboarding flow.
 * Covers AC-1 (URL-only form, no token field), AC-3 (success → /project-map),
 * AC-4 (descriptive per-cause inline errors).
 *
 * Most tests use the synthetic session seeded by auth.setup.ts (AUTH_SECRET only).
 * Tests that require real GitHub org restrictions remain skipped.
 *
 * Server Action POST responses are mocked via page.route() using React Flight
 * wire format so that error/success flows can be tested without real GitHub credentials.
 */

import { test, expect } from '../../support/merged-fixtures';
import { resetRepoConnection } from '../../support/reset-repo-connection';

/**
 * Generates a minimal React Flight (RSC) wire-format payload for a Server Action
 * that returns a plain object. Chunk 1 carries the action result; chunk 0 is the
 * root referencing it via the "a" (action) field.
 */
function rscActionPayload(result: unknown): string {
  return `1:${JSON.stringify(result)}\n0:{"a":"$@1","f":"","b":""}`;
}

// Clear any stale RepoConnection left by prior test runs. Tests in this file
// that use the authenticated `page` fixture (without withRepoConnection) expect
// the user to have NO connection — a stale row would redirect /onboarding to
// /project-map, failing those tests.
test.beforeAll(resetRepoConnection);

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
  test(
    '[P1] "Validating…" appears on the button immediately after form submission',
    async ({ page }) => {
      await page.goto('/onboarding');

      // Hold the Server Action POST open so we can observe the pending state.
      // Only intercept POST requests with Next-Action header (Server Action calls),
      // not the initial page load GET.
      let resolveHeld!: () => void;
      const held = new Promise<void>((r) => { resolveHeld = r; });
      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await held; // block until the assertion below completes
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({ error: 'Repository not found.', errorCode: 'NOT_FOUND' }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/a/b');
      await page.getByRole('button', { name: /connect repository/i }).click();

      // Button label switches while Server Action is in flight
      await expect(page.getByRole('button', { name: /validating/i })).toBeVisible();

      // Release the held request so the test can clean up
      resolveHeld();
    },
  );
});

// ─── Error states (AC-4) — mocked via page.route() ───────────────────────────

test.describe('Story 1.3 — inline error display (AC-4)', () => {
  test(
    '[P0] submitting a URL for a non-existent repository shows a "not found" inline error (AC-4)',
    async ({ page }) => {
      await page.goto('/onboarding');

      // Mock Server Action to return a NOT_FOUND error without hitting GitHub API
      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({
              error: 'Repository not found. Check that the URL is correct and you have access to it.',
              errorCode: 'NOT_FOUND',
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/nonexistent-org/nonexistent-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/not found/i);
    },
  );

  test(
    '[P0] submitting a read-only repository shows an "insufficient permission" inline error (AC-4)',
    async ({ page }) => {
      await page.goto('/onboarding');

      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({
              error: "You don't have write access to this repository. bmad-easy requires write access to create and update BMAD artifacts.",
              errorCode: 'INSUFFICIENT_PERMISSION',
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/some-org/read-only-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/write access/i);
    },
  );

  test.skip(
    '[P1] org OAuth App restriction error explicitly names the org cause — not a generic message (AC-4)',
    async ({ page }) => {
      // Requires a test repo in an org with OAuth App access restrictions enabled.
      // Cannot be simulated without a real GitHub org configured with App restrictions.
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

// ─── Successful connection (AC-3) — mocked via page.route() ──────────────────

test.describe('Story 1.3 — successful repository connection (AC-3)', () => {
  test(
    '[P0] submitting a valid URL returns success and navigates to /project-map (AC-3)',
    async ({ page }) => {
      await page.goto('/onboarding');

      // Intercept /project-map (currently 404 until Epic 2) so the navigation target resolves
      await page.route('**/project-map', (route) =>
        route.fulfill({ status: 200, body: '<html><body>Project Map</body></html>' }),
      );

      // Mock Server Action to return success without calling GitHub API
      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({ success: true }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/test-org/test-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      await expect(page).toHaveURL('/project-map', { timeout: 15_000 });
    },
  );

  test.skip(
    '[P1] encrypted token is never visible in the browser — response body check (AC-3)',
    async ({ page }) => {
      // Requires real GitHub credentials and a writable test repo.
      // Cannot be simulated with route mocking since token security is a server-side property.
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
