import { test, expect } from '../../support/merged-fixtures';

/**
 * HYD-E2E-002 / HYD-E2E-003 / HYD-E2E-004: Hydration & Console-Error Detection
 *
 * Verifies that key routes hydrate without browser console errors or uncaught
 * page errors. The global console-error guard (playwright/support/console-error-guard.ts)
 * is wired into merged-fixtures.ts, so every test here automatically fails if a
 * console.error or pageerror fires during the test — navigating and asserting
 * visible content is sufficient to catch hydration mismatches and runtime errors.
 *
 * HYD-E2E-002: /project-map hydration + h1 tabindex server attribute.
 * HYD-E2E-003: /artifacts hydration.
 * HYD-E2E-004: /settings hydration.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getTestId (no CSS classes or XPath).
 */

test.describe.serial('Hydration & Console-Error Guard', () => {
  test('[P0] /project-map hydrates without console errors (HYD-E2E-002)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto('/project-map');

    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();
  });

  test('[P0] /project-map h1 has tabindex=-1 in server HTML (HYD-E2E-002)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto('/project-map');

    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    const tabindex = await page.evaluate(() =>
      document.querySelector('h1')?.getAttribute('tabindex'),
    );
    expect(tabindex).toBe('-1');
  });

  test('[P1] /artifacts hydrates without console errors (HYD-E2E-003)', async ({
    page,
    withRepoConnection,
  }) => {
    await page.goto('/artifacts');

    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();
  });

  test('[P1] /settings hydrates without console errors (HYD-E2E-004)', async ({
    page,
    withRepoConnection,
  }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  });
});
