/**
 * ATDD — Story 1.4: Validate BMAD Initialization in the Connected Repository
 * E2E tests for BMAD validation error display and success flow.
 *
 * Covers:
 * - AC-1: Successful validation → redirect to /project-map
 * - AC-3: Missing directories → blocking message + documentation link
 * - AC-4: Missing .claude/skills/ → blocking message
 * - AC-5: Empty .claude/skills/ → blocking message
 * - AC-6: Version outside v6.x → blocking message naming detected version
 *
 * Server Action POST responses are mocked via page.route() using React Flight
 * wire format so that error/success flows can be tested without real GitHub
 * credentials. Follows the pattern established in onboarding.spec.ts (Story 1.3).
 */

import { test, expect } from '../../support/merged-fixtures';
import { resetRepoConnection } from '../../support/reset-repo-connection';

/**
 * Generates a React Flight (RSC) wire-format payload for a Server Action
 * that returns a plain object. Matches the Next.js 16 format:
 * - Chunk 0: root referencing the action result via "a" field
 * - Chunk 1 (D): diagnostic metadata
 * - Chunk 1: the actual action result
 */
function rscActionPayload(result: unknown): string {
  return `0:{"a":"$@1","f":"","b":"development","q":"","i":false}\n1:D{"time":0.5}\n1:${JSON.stringify(result)}\n`;
}

const BMAD_DOCS_URL = 'https://docs.bmad-method.org';

// Clear any stale RepoConnection left by prior test runs. All tests in this
// file use the authenticated `page` fixture and expect the user to have NO
// connection so the /onboarding form is visible (not redirected to /project-map).
test.beforeAll(resetRepoConnection);

// ─── MISSING_DIRECTORY error (AC-3) ──────────────────────────────────────────

test.describe('Story 1.4 — missing BMAD directories (AC-3)', () => {
  test(
    '[P0] submitting a URL for a repo missing BMAD directories shows a MISSING_DIRECTORY error (AC-3)',
    async ({ page }) => {
      await page.goto('/onboarding');

      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({
              error: 'BMAD initialization is incomplete. Missing prerequisite directory: _bmad/. See BMAD documentation to set up your repository.',
              errorCode: 'MISSING_DIRECTORY',
              documentationLink: BMAD_DOCS_URL,
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/my-org/uninitialized-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.locator('#repo-url-error');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/_bmad/);
      await expect(alert).toContainText(/missing/i);
    },
  );

  test(
    '[P0] MISSING_DIRECTORY error includes a clickable documentation link (AC-3)',
    async ({ page }) => {
      await page.goto('/onboarding');

      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({
              error: 'BMAD initialization is incomplete. Missing prerequisite directory: _bmad-output/. See BMAD documentation to set up your repository.',
              errorCode: 'MISSING_DIRECTORY',
              documentationLink: BMAD_DOCS_URL,
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/my-org/missing-output-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const link = page.getByRole('link', { name: /bmad documentation/i });
      await expect(link).toBeVisible({ timeout: 15_000 });
      await expect(link).toHaveAttribute('href', BMAD_DOCS_URL);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    },
  );
});

// ─── UNSUPPORTED_VERSION error (AC-6) ────────────────────────────────────────

test.describe('Story 1.4 — unsupported BMAD version (AC-6)', () => {
  test(
    '[P0] submitting a URL for a repo with unsupported BMAD version shows UNSUPPORTED_VERSION error (AC-6)',
    async ({ page }) => {
      await page.goto('/onboarding');

      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({
              error: 'BMAD version 5.9.9 is not supported. Only BMAD v6 is supported. See BMAD documentation to upgrade.',
              errorCode: 'UNSUPPORTED_VERSION',
              documentationLink: BMAD_DOCS_URL,
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/my-org/old-bmad-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.locator('#repo-url-error');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/5\.9\.9/);
      await expect(alert).toContainText(/v6/i);
    },
  );

  test(
    '[P0] UNSUPPORTED_VERSION error names the detected version in the message (AC-6)',
    async ({ page }) => {
      await page.goto('/onboarding');

      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({
              error: 'BMAD version 7.0.0 is not supported. Only BMAD v6 is supported. See BMAD documentation to upgrade.',
              errorCode: 'UNSUPPORTED_VERSION',
              documentationLink: BMAD_DOCS_URL,
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/my-org/future-bmad-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.locator('#repo-url-error');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/7\.0\.0/);
    },
  );
});

// ─── NO_SKILLS_FOUND error (AC-4, AC-5) ──────────────────────────────────────

test.describe('Story 1.4 — skills directory validation (AC-4, AC-5)', () => {
  test(
    '[P0] submitting a URL for a repo with no .claude/skills/ directory shows NO_SKILLS_FOUND error (AC-4)',
    async ({ page }) => {
      await page.goto('/onboarding');

      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({
              error: 'No Skills directory was found at .claude/skills/. See BMAD documentation to set up Skills.',
              errorCode: 'NO_SKILLS_FOUND',
              documentationLink: BMAD_DOCS_URL,
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/my-org/no-skills-dir-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.locator('#repo-url-error');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/skill/i);
      await expect(alert).toContainText(/directory/i);
    },
  );

  test(
    '[P0] submitting a URL for a repo with empty .claude/skills/ shows NO_SKILLS_FOUND error (AC-5)',
    async ({ page }) => {
      await page.goto('/onboarding');

      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload({
              error: 'No BMAD Skills were found in .claude/skills/. See BMAD documentation to install Skills.',
              errorCode: 'NO_SKILLS_FOUND',
              documentationLink: BMAD_DOCS_URL,
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByLabel(/repository url/i).fill('https://github.com/my-org/empty-skills-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.locator('#repo-url-error');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toContainText(/skill/i);
    },
  );
});

// ─── Documentation link behavior (AC-3, AC-4, AC-5, AC-6) ─────────────────────

test.describe('Story 1.4 — documentation link behavior', () => {
  test(
    '[P0] documentation link is NOT shown for non-BMAD validation errors',
    async ({ page }) => {
      await page.goto('/onboarding');

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

      await page.getByLabel(/repository url/i).fill('https://github.com/my-org/nonexistent-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      const alert = page.locator('#repo-url-error');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('link', { name: /bmad documentation/i })).not.toBeVisible();
    },
  );

  test(
    '[P1] documentation link is cleared on next submission attempt',
    async ({ page }) => {
      await page.goto('/onboarding');

      let callCount = 0;
      await page.route('**/onboarding', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          callCount++;
          if (callCount === 1) {
            await route.fulfill({
              status: 200,
              contentType: 'text/x-component',
              body: rscActionPayload({
                error: 'BMAD initialization is incomplete. Missing prerequisite directory: _bmad/.',
                errorCode: 'MISSING_DIRECTORY',
                documentationLink: BMAD_DOCS_URL,
              }),
            });
          } else {
            await route.fulfill({
              status: 200,
              contentType: 'text/x-component',
              body: rscActionPayload({ success: true }),
            });
          }
        } else {
          await route.continue();
        }
      });

      // Mock /project-map so navigation doesn't 404 (matches both regular and RSC prefetch requests)
      await page.route('**/project-map**', (route) =>
        route.fulfill({ status: 200, body: '<html><body>Project Map</body></html>' }),
      );

      await page.getByLabel(/repository url/i).fill('https://github.com/my-org/test-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      // First submission shows documentation link
      await expect(page.getByRole('link', { name: /bmad documentation/i })).toBeVisible({ timeout: 15_000 });

      // Second submission clears the link and navigates to /project-map
      await page.getByRole('button', { name: /connect repository/i }).click();
      await expect(page.getByRole('link', { name: /bmad documentation/i })).not.toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL('/project-map', { timeout: 15_000 });
    },
  );
});

// ─── Successful BMAD validation (AC-1) ───────────────────────────────────────

test.describe('Story 1.4 — successful BMAD validation (AC-1)', () => {
  test(
    '[P0] submitting a URL that passes BMAD validation redirects to /project-map (AC-1)',
    async ({ page }) => {
      await page.goto('/onboarding');

      // Intercept /project-map (currently 404 until Epic 2) so the navigation target resolves
      // Use ** to also match RSC prefetch requests like /project-map?_rsc=...
      await page.route('**/project-map**', (route) =>
        route.fulfill({ status: 200, body: '<html><body>Project Map</body></html>' }),
      );

      // Mock Server Action to return success (BMAD validation passed)
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

      await page.getByLabel(/repository url/i).fill('https://github.com/my-org/valid-bmad-repo');
      await page.getByRole('button', { name: /connect repository/i }).click();

      await expect(page).toHaveURL('/project-map', { timeout: 15_000 });
    },
  );
});
