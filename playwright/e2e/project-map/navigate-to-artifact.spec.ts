import { test, expect } from '../../support/merged-fixtures';

/**
 * ATDD — Story 2.6: Navigate from the Project Map to an Artifact
 * E2E tests for the cross-page navigation user journey.
 *
 * Covers:
 * - AC-1: Completed artifact card click opens the Artifact Browser pre-selected (FR8)
 * - AC-2: In-progress artifact card click opens the read-only Artifact Browser (FR8)
 *
 * These tests complement the Story 2.6 component tests (ArtifactCard.test.tsx,
 * page.test.tsx) which verify the href is constructed correctly at the unit
 * level. Here we verify the end-to-end integration: the href built by the
 * Project Map page is consumed by the Artifact Browser page (Story 2.5) and the
 * clicked artifact renders pre-selected in the two-column layout.
 *
 * Conversation-tab-focus for in-progress artifacts is deferred to Epic 3
 * (Story 3.5) — both statuses navigate to /artifacts?id={id} in this story.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 *
 * Fixtures (from support/custom-fixtures.ts):
 * - withArtifacts: seeds 3 Artifact rows (PRD completed, Architecture
 *   in-progress, Epics completed). Returns the seeded artifacts with their
 *   generated IDs so tests can assert the destination URL after click.
 */

const PROJECT_MAP_ROUTE = '/project-map';

test.describe('Story 2.6: Navigate from the Project Map to an Artifact', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] clicking a completed artifact card opens the Artifact Browser with that artifact pre-selected (AC-1, FR8)', async ({
    page,
    withArtifacts,
  }) => {
    const prdArtifact = withArtifacts.find((a) => a.type === 'prd');
    if (!prdArtifact) throw new Error('PRD artifact not found in seed data');

    await page.goto(PROJECT_MAP_ROUTE);
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    // ArtifactCard renders as a <Link>/<a> with role="listitem" (which overrides
    // the implicit link role). Filter by the card's title text to target it.
    const prdCard = page
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Product Requirements' });
    await expect(prdCard).toBeVisible();

    await prdCard.click();

    // Navigation targets the Artifact Browser with the clicked artifact's id.
    await expect(page).toHaveURL(/\/artifacts\?id=.+/);
    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();

    // Two-column layout renders (list + content pane).
    const list = page.getByRole('list', { name: 'Artifact list' });
    await expect(list).toBeVisible();
    const contentPane = page.getByRole('main', { name: 'Artifact content' });
    await expect(contentPane).toBeVisible();

    // The clicked artifact is pre-selected (aria-current="true" on its entry).
    const selectedEntry = list
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Product Requirements' });
    await expect(selectedEntry).toHaveAttribute('aria-current', 'true');

    // The pre-selected artifact's content renders in the content pane.
    await expect(
      contentPane.getByRole('heading', { name: 'Product Requirements Overview' }),
    ).toBeVisible();
  });

  test('[P0] clicking an in-progress artifact card opens the read-only Artifact Browser (AC-2, FR8)', async ({
    page,
    withArtifacts,
  }) => {
    const architectureArtifact = withArtifacts.find((a) => a.type === 'architecture');
    if (!architectureArtifact) throw new Error('Architecture artifact not found in seed data');

    await page.goto(PROJECT_MAP_ROUTE);
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    const architectureCard = page
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Architecture' });
    await expect(architectureCard).toBeVisible();

    await architectureCard.click();

    // In-progress artifacts use the same href as completed artifacts (AC-2).
    await expect(page).toHaveURL(/\/artifacts\?id=.+/);
    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();

    // Two-column layout renders with the in-progress artifact's content.
    const contentPane = page.getByRole('main', { name: 'Artifact content' });
    await expect(contentPane).toBeVisible();
    await expect(contentPane.getByRole('heading', { name: 'Architecture' })).toBeVisible();

    // AC-2: the view is read-only — no editing controls present.
    await expect(contentPane.getByRole('button')).toHaveCount(0);
    await expect(contentPane.getByRole('textbox')).toHaveCount(0);
  });

  test('[P0] navigation from Project Map to Artifact Browser completes within 2 seconds (NFR-P4)', async ({
    page,
    withArtifacts,
  }) => {
    const prdArtifact = withArtifacts.find((a) => a.type === 'prd');
    if (!prdArtifact) throw new Error('PRD artifact not found in seed data');

    await page.goto(PROJECT_MAP_ROUTE);
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    const warmupCard = page
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Product Requirements' });
    await warmupCard.click();
    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Artifact content' })).toBeVisible();

    await page.goto(PROJECT_MAP_ROUTE);
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();
    const prdCard = page
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Product Requirements' });

    const start = performance.now();
    await prdCard.click();
    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Artifact content' })).toBeVisible();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2_000);
  });

  test('[P1] keyboard activation (Enter) on a card navigates to the Artifact Browser (UX-DR16)', async ({
    page,
    withArtifacts,
  }) => {
    const prdArtifact = withArtifacts.find((a) => a.type === 'prd');
    if (!prdArtifact) throw new Error('PRD artifact not found in seed data');

    await page.goto(PROJECT_MAP_ROUTE);
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    // The card is a <Link>/<a href> — naturally focusable via keyboard. The
    // implicit link role is overridden by role="listitem", but focusability is
    // unaffected (driven by the <a href> element, not the role).
    const prdCard = page
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Product Requirements' });
    await prdCard.focus();
    await expect(prdCard).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/artifacts\?id=.+/);
    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Artifact content' })).toBeVisible();
  });
});
