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
 * GREEN PHASE: RefreshButton is wired to the Project Map header (Task 2.1 done).
 * These tests use page.route() to mock the Server Action POST response (React
 * Flight wire format — same pattern as bmad-validation.spec.ts), allowing
 * verification of spinner state, syncArtifactsAction invocation, and page
 * re-render without a real GitHub API call. The withArtifacts fixture seeds
 * Artifact rows so the page renders with data without triggering a real sync.
 *
 * Note: project-map.spec.ts also has 2 active tests for Story 2.3 that test
 * the refresh button with the real (unmocked) Server Action. These tests
 * complement them with mocked-action verification for more isolated coverage.
 */

function rscActionPayload(result: unknown): string {
  return `0:{"a":"$@1","f":"","b":"development","q":"","i":false}\n1:D{"time":0.5}\n1:${JSON.stringify(result)}\n`;
}

const SYNC_SUCCESS = {
  success: true,
  artifactsUpserted: 2,
  artifactsDeleted: 0,
};

const MOCK_SYNC_DELAY_MS = 500;

test.describe('Story 2.3: Manual Refresh (AC-1)', () => {
  test.describe.configure({ mode: 'serial' });

  test(
    '[P0] refresh button is visible on the Project Map page (AC-1, Task 2.1)',
    async ({ page, withArtifacts }) => {
      await page.goto('/project-map');

      await expect(
        page.getByRole('button', { name: /refresh project map/i }),
      ).toBeVisible();
    },
  );

  test(
    '[P0] clicking refresh shows spinner and disables button during sync (AC-1)',
    async ({ page, withArtifacts }) => {
      await page.route('**/project-map', async (route) => {
        if (
          route.request().method() === 'POST' &&
          route.request().headers()['next-action']
        ) {
          await new Promise((r) => setTimeout(r, MOCK_SYNC_DELAY_MS));
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

      await Promise.all([
        expect(refreshButton).toBeDisabled(),
        expect(refreshButton.locator('svg')).toHaveClass(/animate-spin/),
      ]);
    },
  );

  test(
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

      const refreshButton = page.getByRole('button', {
        name: /refresh project map/i,
      });
      await refreshButton.click();

      await expect.poll(() => syncCalled).toBe(true);

      await expect(refreshButton).toBeEnabled();
    },
  );

  test(
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

  test(
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

      await expect(refreshButton).toBeDisabled();
      await expect(refreshButton).toBeEnabled();
    },
  );
});
