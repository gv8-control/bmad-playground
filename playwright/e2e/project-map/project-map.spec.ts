import { test, expect } from '../../support/merged-fixtures';

/**
 * NFR-P3: Project Map loads ≤ 2s.
 * FR-6–8: Project Map and Artifact Browser.
 */
test.describe('Project Map', () => {
  test('loads within 2 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/dashboard');

    await expect(page.getByTestId('project-map')).toBeVisible();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2_000); // NFR-P3
  });

  test('shows connected repositories', async ({ page }) => {
    await page.goto('/dashboard');
    const repos = page.getByTestId('repository-card');
    await expect(repos.first()).toBeVisible();
  });

  test('remains accessible when sandbox provisioning fails', async ({ page, interceptNetworkCall }) => {
    // Simulate Daytona outage: stub the conversation endpoint to return 503
    await page.route('**/api/conversations', (route) => {
      route.fulfill({ status: 503, body: JSON.stringify({ error: 'Daytona unavailable' }) });
    });

    await page.goto('/dashboard');

    // Project Map is a pure git read — must still load despite Daytona outage
    await expect(page.getByTestId('project-map')).toBeVisible();
    await expect(page.getByTestId('new-conversation-button')).toBeDisabled();
    await expect(page.getByTestId('daytona-outage-notice')).toBeVisible();
  });
});
