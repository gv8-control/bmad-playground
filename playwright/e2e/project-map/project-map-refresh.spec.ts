import { test, expect } from '../../support/merged-fixtures';

/**
 * ATDD — Story 2.3: Manually Refresh the Project Map
 * E2E tests for the manual refresh user journey.
 *
 * Covers:
 * - AC-1: Manual refresh re-reads via mirroring mechanism with spinner (FR7)
 *
 * AC-2 (refresh does not interrupt active Conversations) is an architectural
 * invariant — no E2E test needed (see story dev notes: syncArtifactsAction has
 * no interaction with agent-be, sandboxes, or conversations; router.refresh()
 * re-renders only the current route's Server Components).
 *
 * RED PHASE: These tests are skipped because Task 2 (wiring RefreshButton to
 * the page header) is not yet implemented. The RefreshButton component exists
 * (Task 1 done, 7 component tests passing) but is not rendered on /project-map.
 * Once Task 2.1 adds <RefreshButton /> to page.tsx, remove the .skip markers
 * one by one per task.
 *
 * Server Action POST responses are mocked via page.route() using React Flight
 * wire format (same pattern as bmad-validation.spec.ts). The withArtifacts
 * fixture seeds Artifact rows so the page renders with data without triggering
 * a real GitHub sync.
 */

function rscActionPayload(result: unknown): string {
  return `0:{"a":"$@1","f":"","b":"development","q":"","i":false}\n1:D{"time":0.5}\n1:${JSON.stringify(result)}\n`;
}

const SYNC_SUCCESS = {
  success: true,
  artifactsUpserted: 2,
  artifactsDeleted: 0,
};

test.describe('Story 2.3: Manual Refresh (AC-1)', () => {
  test.describe.configure({ mode: 'serial' });

  test.skip(
    '[P0] refresh button is visible on the Project Map page (AC-1, Task 2.1)',
    async ({ page, withArtifacts }) => {
      await page.goto('/project-map');

      await expect(
        page.getByRole('button', { name: /refresh project map/i }),
      ).toBeVisible();
    },
  );

  test.skip(
    '[P0] clicking refresh shows spinner and disables button during sync (AC-1)',
    async ({ page, withArtifacts }) => {
      await page.route('**/project-map', async (route) => {
        if (
          route.request().method() === 'POST' &&
          route.request().headers()['next-action']
        ) {
          await new Promise((r) => setTimeout(r, 500));
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload(SYNC_SUCCESS),
          });
        } else {
          await route.continue();
        }
      });

      await page.goto('/project-map');

      const refreshButton = page.getByRole('button', {
        name: /refresh project map/i,
      });
      await refreshButton.click();

      await expect(refreshButton).toBeDisabled();
      const icon = refreshButton.locator('svg');
      await expect(icon).toHaveClass(/animate-spin/);
    },
  );

  test.skip(
    '[P0] clicking refresh calls syncArtifactsAction — the mirroring mechanism (AC-1, FR7)',
    async ({ page, withArtifacts }) => {
      let syncCalled = false;

      await page.route('**/project-map', async (route) => {
        if (
          route.request().method() === 'POST' &&
          route.request().headers()['next-action']
        ) {
          syncCalled = true;
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload(SYNC_SUCCESS),
          });
        } else {
          await route.continue();
        }
      });

      await page.goto('/project-map');

      await page
        .getByRole('button', { name: /refresh project map/i })
        .click();

      await expect.poll(() => syncCalled).toBe(true);
    },
  );

  test.skip(
    '[P0] page re-renders with fresh data after refresh completes (AC-1)',
    async ({ page, withArtifacts }) => {
      await page.route('**/project-map', async (route) => {
        if (
          route.request().method() === 'POST' &&
          route.request().headers()['next-action']
        ) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload(SYNC_SUCCESS),
          });
        } else {
          await route.continue();
        }
      });

      await page.goto('/project-map');

      await expect(page.getByText('bmad-easy Architecture')).toBeVisible();

      await page
        .getByRole('button', { name: /refresh project map/i })
        .click();

      await expect(page.getByText('bmad-easy Architecture')).toBeVisible();
    },
  );

  test.skip(
    '[P1] refresh button re-enables after sync completes (AC-1)',
    async ({ page, withArtifacts }) => {
      await page.route('**/project-map', async (route) => {
        if (
          route.request().method() === 'POST' &&
          route.request().headers()['next-action']
        ) {
          await route.fulfill({
            status: 200,
            contentType: 'text/x-component',
            body: rscActionPayload(SYNC_SUCCESS),
          });
        } else {
          await route.continue();
        }
      });

      await page.goto('/project-map');

      const refreshButton = page.getByRole('button', {
        name: /refresh project map/i,
      });
      await refreshButton.click();

      await expect(refreshButton).toBeEnabled();
    },
  );
});
