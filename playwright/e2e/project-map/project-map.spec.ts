import { test, expect } from '../../support/merged-fixtures';

/**
 * ATDD — Story 2.2: View the Project Map
 * E2E tests for the Project Map user journey.
 * Covers AC-1 (artifact list visible), AC-2 (in-progress visual distinction),
 * AC-3 (empty state), AC-4 (credential error banner), AC-5 (NFR-P3 load time).
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByTestId (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

test.describe('Story 2.2: Project Map', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] Project Map loads within 2 seconds (NFR-P3, AC-5)', async ({ page, withArtifacts }) => {
    // Warm up the route (dev-mode compilation) so the timed run measures
    // steady-state page load, not first-compile latency.
    await page.goto('/project-map');
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    await test.step('Measure steady-state page load', async () => {
      const start = performance.now();
      await page.goto('/project-map');
      await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2_000);
    });
  });

  test('[P0] authenticated user sees artifact cards on /project-map (AC-1, FR6)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto('/project-map');

    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    const cards = page.getByRole('listitem');
    await expect(cards).toHaveCount(3);

    await expect(cards.first()).toBeVisible();

    await expect(page.getByText('bmad-easy Architecture')).toBeVisible();
    await expect(page.getByText('bmad-easy Product Requirements')).toBeVisible();
    await expect(page.getByText('Epic Breakdown')).toBeVisible();

    await expect(page.getByText('Architecture', { exact: true })).toBeVisible();
    await expect(page.getByText('PRD', { exact: true })).toBeVisible();
    await expect(page.getByText('Epics', { exact: true })).toBeVisible();
  });

  test('[P0] in-progress and completed artifacts show text labels — not color alone (AC-2, UX-DR16)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto('/project-map');

    await expect(page.getByText('In progress', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
  });

  test('[P0] credential error banner appears when credential is missing (AC-4, UX-DR10)', async ({
    page,
    withRepoConnection,
  }) => {
    await page.goto('/project-map');

    await expect(
      page.getByText('Your repository connection needs attention.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Update access token' })).toBeVisible();
  });

  test('[P1] empty state prompt is visible when no artifacts are available (AC-3, UX-DR19)', async ({
    page,
    withRepoConnection,
  }) => {
    await page.goto('/project-map');

    await expect(
      page.getByText('Start your first conversation to create an artifact.'),
    ).toBeVisible();
  });
});

test.describe('Story 2.3: Manually Refresh the Project Map', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] refresh button is visible on the Project Map header (AC-1, FR-7)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto('/project-map');

    await expect(
      page.getByRole('button', { name: /refresh project map/i }),
    ).toBeVisible();
  });

});
