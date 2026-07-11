import { test, expect } from '../../support/merged-fixtures';

/**
 * ATDD — Story 2.4: Browse and Read All Committed Artifacts
 * E2E tests for the Artifact Browser user journey.
 * Covers AC-1 (full-width flat list sorted by last-modified descending),
 * AC-2 (skeleton loader while loading), AC-3 (credential error banner),
 * NFR-P4 (Artifact Browser loads within 2 seconds).
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 *
 * Fixtures (from support/custom-fixtures.ts):
 * - withRepoConnection: seeds a RepoConnection (credentialHealth 'healthy') but
 *   no OAuthCredential row, so syncArtifactsAction returns NO_CREDENTIAL → the
 *   credential error banner appears and the empty state renders.
 * - withArtifacts: seeds Artifact rows so the list renders with data without
 *   triggering a real GitHub sync.
 */

const ARTIFACTS_ROUTE = '/artifacts';

test.describe('Story 2.4: Artifact Browser', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] Artifact Browser loads within 2 seconds (NFR-P4, AC-1)', async ({
    page,
    withArtifacts,
  }) => {
    // Warm up the route (dev-mode compilation) so the timed run measures
    // steady-state page load, not first-compile latency.
    await page.goto(ARTIFACTS_ROUTE);
    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();

    await test.step('Measure steady-state page load', async () => {
      const start = performance.now();
      await page.goto(ARTIFACTS_ROUTE);
      await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2_000);
    });
  });

  test('[P0] authenticated user sees the Artifact Browser heading and breadcrumb (AC-1, UX-DR12)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);

    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();
    // The Breadcrumb renders "← Project Map"; the side nav also links to
    // /project-map, so scope to the breadcrumb's exact accessible name.
    await expect(page.getByRole('link', { name: '← Project Map' })).toBeVisible();
  });

  test('[P0] artifact list entries are visible on /artifacts (AC-1, FR16)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);

    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();

    const entries = page.getByRole('listitem');
    await expect(entries).toHaveCount(3);
    await expect(entries.first()).toBeVisible();

    await expect(page.getByText('bmad-easy Product Requirements')).toBeVisible();
    await expect(page.getByText('bmad-easy Architecture')).toBeVisible();
    await expect(page.getByText('Epic Breakdown')).toBeVisible();
  });

  test('[P0] list is sorted by last-modified date descending (AC-1, FR16, UX-DR12)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);

    const entries = page.getByRole('listitem');
    await expect(entries).toHaveCount(3);

    // Seed order by lastModifiedAt: Architecture (Jul 2) > PRD (Jul 1) > Epics (Jun 28).
    // Descending sort must surface Architecture first, Epics last.
    await expect(entries.nth(0).getByText('bmad-easy Architecture')).toBeVisible();
    await expect(entries.nth(1).getByText('bmad-easy Product Requirements')).toBeVisible();
    await expect(entries.nth(2).getByText('Epic Breakdown')).toBeVisible();
  });

  test('[P0] list is flat — completed and in-progress artifacts are mixed, not grouped (AC-1, UX-DR12)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);

    // Non-color state signaling (UX-DR16): both status labels appear as text.
    await expect(page.getByText('In progress', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();

    // The in-progress artifact (Architecture) sits above a completed one (PRD),
    // proving the list is not sectioned by status.
    const entries = page.getByRole('listitem');
    await expect(entries.nth(0).getByText('In progress', { exact: true })).toBeVisible();
    await expect(entries.nth(1).getByText('Completed', { exact: true })).toBeVisible();
  });

  test('[P0] each entry shows type label, title, status badge, and formatted date (AC-1, UX-DR16)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);

    // Type labels (uppercase, distinct from titles).
    await expect(page.getByText('Architecture', { exact: true })).toBeVisible();
    await expect(page.getByText('PRD', { exact: true })).toBeVisible();

    // Formatted dates (Intl.DateTimeFormat 'en-US' → "Mon D").
    await expect(page.getByText('Jul 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Jul 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Jun 28', { exact: true })).toBeVisible();
  });

  test('[P0] list container exposes role="list" with an accessible label (AC-1, UX-DR16)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);

    const list = page.getByRole('list', { name: /artifact list/i });
    await expect(list).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(3);
  });

  test('[P0] credential error banner appears when credential is missing (AC-3, UX-DR10)', async ({
    page,
    withRepoConnection,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);

    await expect(
      page.getByText('Your repository connection needs attention.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Update access token' })).toBeVisible();
  });

  test('[P1] empty state prompt is visible when no artifacts are available (AC-1, UX-DR19)', async ({
    page,
    withRepoConnection,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);

    await expect(
      page.getByText('Start your first conversation to create an artifact.'),
    ).toBeVisible();
  });

  // AC-2 (skeleton loader while loading) is covered at the unit level by
  // apps/web/src/app/(dashboard)/(app)/artifacts/loading.test.tsx. App Router
  // streams loading.tsx as part of the HTML response, so an E2E assertion would
  // require blocking the document response — which prevents page.goto from
  // resolving and produces a flaky test. The project-map suite follows the same
  // convention (no E2E test for loading.tsx).
});
