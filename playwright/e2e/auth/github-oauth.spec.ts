import { test, expect } from '../../support/merged-fixtures';

/**
 * P0-001: GitHub OAuth sign-in flow.
 * Validates that users can authenticate and land on the dashboard.
 * Also validates that credential health is surfaced (NFR-R1).
 */
test.describe('GitHub OAuth authentication', () => {
  test('successful sign-in lands on dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('project-map')).toBeVisible();
  });

  test('unauthenticated access redirects to sign-in', async ({ browser }) => {
    const context = await browser.newContext(); // no storageState — anonymous
    const page = await context.newPage();

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/signin/);

    await context.close();
  });

  test('credential health indicator reflects connected status', async ({ page }) => {
    await page.goto('/dashboard');
    const credentialBadge = page.getByTestId('credential-health');
    await expect(credentialBadge).toHaveAttribute('data-status', 'healthy');
  });
});
