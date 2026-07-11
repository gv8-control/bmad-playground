import { test, expect } from '../../support/merged-fixtures';

/**
 * ATDD — Story 2.5: View a Single Artifact's Rendered Content
 * E2E tests for the two-column Artifact Browser with rendered Markdown content.
 *
 * Covers:
 * - AC-1: Two-column layout when an Artifact is selected (FR16, UX-DR12)
 *   - List narrows to 280px, content pane renders Markdown (headings, lists,
 *     tables, code blocks, bold, italic), read-only, loads within 2s (NFR-P4)
 * - AC-2: Artifact load error state — "Couldn't load this artifact" + Refresh
 * - AC-3: Back navigation returns to entry point (FR17)
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 *
 * Fixtures (from support/custom-fixtures.ts):
 * - withArtifacts: seeds 3 Artifact rows. The PRD artifact has rich Markdown
 *   content (headings, lists, tables, code blocks, bold, italic, frontmatter)
 *   so AC-1's rendering requirements can be verified end-to-end. Returns the
 *   seeded artifacts with their generated IDs so tests can navigate to
 *   /artifacts?id={id} directly.
 */

const ARTIFACTS_ROUTE = '/artifacts';

test.describe('Story 2.5: View a Single Artifact\'s Rendered Content', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] clicking an artifact entry shows the two-column layout with list and content pane (AC-1, FR16, UX-DR12)', async ({
    page,
    withArtifacts,
  }) => {
    const prdArtifact = withArtifacts.find((a) => a.type === 'prd');
    if (!prdArtifact) throw new Error('PRD artifact not found in seed data');

    await page.goto(`${ARTIFACTS_ROUTE}?id=${prdArtifact.id}`);

    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();

    const list = page.getByRole('list', { name: 'Artifact list' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(3);

    const contentPane = page.getByRole('main', { name: 'Artifact content' });
    await expect(contentPane).toBeVisible();
  });

  test('[P0] selected entry is marked with aria-current="true" (AC-1, UX-DR16)', async ({
    page,
    withArtifacts,
  }) => {
    const prdArtifact = withArtifacts.find((a) => a.type === 'prd');
    if (!prdArtifact) throw new Error('PRD artifact not found in seed data');

    await page.goto(`${ARTIFACTS_ROUTE}?id=${prdArtifact.id}`);

    const selectedEntry = page
      .getByRole('list', { name: 'Artifact list' })
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Product Requirements' });
    await expect(selectedEntry).toHaveAttribute('aria-current', 'true');
  });

  test('[P0] content pane renders Markdown headings, lists, tables, code blocks, bold, and italic (AC-1)', async ({
    page,
    withArtifacts,
  }) => {
    const prdArtifact = withArtifacts.find((a) => a.type === 'prd');
    if (!prdArtifact) throw new Error('PRD artifact not found in seed data');

    await page.goto(`${ARTIFACTS_ROUTE}?id=${prdArtifact.id}`);

    const contentPane = page.getByRole('main', { name: 'Artifact content' });
    await expect(contentPane).toBeVisible();

    await test.step('Heading rendered (h1)', async () => {
      await expect(
        contentPane.getByRole('heading', { name: 'Product Requirements Overview' }),
      ).toBeVisible();
    });

    await test.step('List items rendered', async () => {
      await expect(contentPane.getByText('Repository connection')).toBeVisible();
      await expect(contentPane.getByText('Artifact browsing')).toBeVisible();
      await expect(contentPane.getByText('Markdown rendering')).toBeVisible();
    });

    await test.step('Table rendered', async () => {
      await expect(contentPane.getByRole('table')).toBeVisible();
      await expect(contentPane.getByRole('columnheader', { name: 'Layer' })).toBeVisible();
      await expect(contentPane.getByRole('columnheader', { name: 'Technology' })).toBeVisible();
      await expect(contentPane.getByRole('cell', { name: 'Frontend' })).toBeVisible();
      await expect(contentPane.getByRole('cell', { name: 'Next.js' })).toBeVisible();
    });

    await test.step('Code block rendered', async () => {
      await expect(contentPane.getByRole('code').first()).toBeVisible();
    });

    await test.step('Bold text rendered (strong)', async () => {
      await expect(contentPane.getByText('core capabilities')).toBeVisible();
    });

    await test.step('Italic text rendered (em)', async () => {
      await expect(contentPane.getByText('real-time collaboration')).toBeVisible();
    });
  });

  test('[P0] content pane is read-only — no editing controls present (AC-1)', async ({
    page,
    withArtifacts,
  }) => {
    const prdArtifact = withArtifacts.find((a) => a.type === 'prd');
    if (!prdArtifact) throw new Error('PRD artifact not found in seed data');

    await page.goto(`${ARTIFACTS_ROUTE}?id=${prdArtifact.id}`);

    const contentPane = page.getByRole('main', { name: 'Artifact content' });
    await expect(contentPane).toBeVisible();

    await expect(contentPane.getByRole('button')).toHaveCount(0);
    await expect(contentPane.getByRole('textbox')).toHaveCount(0);
  });

  test('[P0] selected artifact loads within 2 seconds (NFR-P4, AC-1)', async ({
    page,
    withArtifacts,
  }) => {
    const prdArtifact = withArtifacts.find((a) => a.type === 'prd');
    if (!prdArtifact) throw new Error('PRD artifact not found in seed data');

    const url = `${ARTIFACTS_ROUTE}?id=${prdArtifact.id}`;

    await page.goto(url);
    await expect(page.getByRole('main', { name: 'Artifact content' })).toBeVisible();

    await test.step('Measure steady-state load', async () => {
      const start = performance.now();
      await page.goto(url);
      await expect(page.getByRole('main', { name: 'Artifact content' })).toBeVisible();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2_000);
    });
  });

  test('[P1] YAML frontmatter is stripped from rendered content (AC-1)', async ({
    page,
    withArtifacts,
  }) => {
    const prdArtifact = withArtifacts.find((a) => a.type === 'prd');
    if (!prdArtifact) throw new Error('PRD artifact not found in seed data');

    await page.goto(`${ARTIFACTS_ROUTE}?id=${prdArtifact.id}`);

    const contentPane = page.getByRole('main', { name: 'Artifact content' });
    await expect(contentPane).toBeVisible();

    await expect(contentPane).not.toContainText('title: bmad-easy Product Requirements');
    await expect(contentPane).not.toContainText('status: completed');
  });

  test('[P0] artifact load error state shows message and Refresh button when artifact not found (AC-2)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(`${ARTIFACTS_ROUTE}?id=nonexistent-artifact-id`);

    await expect(
      page.getByText("Couldn't load this artifact. Try refreshing the page."),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });

  test('[P0] clicking Refresh re-renders the page without error (AC-2)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(`${ARTIFACTS_ROUTE}?id=nonexistent-artifact-id`);
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();

    await page.getByRole('button', { name: 'Refresh' }).click();

    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();
    await expect(
      page.getByText("Couldn't load this artifact. Try refreshing the page."),
    ).toBeVisible();
  });

  test('[P0] browser back button returns to full-width list from two-column view (AC-3, FR17)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);
    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();

    await page.getByRole('listitem').first().click();
    await expect(page).toHaveURL(/\/artifacts\?id=.+/);
    await expect(page.getByRole('main', { name: 'Artifact content' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(ARTIFACTS_ROUTE);
    await expect(page.getByRole('main', { name: 'Artifact content' })).not.toBeVisible();
  });

  test('[P0] breadcrumb link returns to Project Map (AC-3, FR17)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto(ARTIFACTS_ROUTE);
    await expect(page.getByRole('link', { name: '← Project Map' })).toBeVisible();

    await page.getByRole('link', { name: '← Project Map' }).click();
    await expect(page).toHaveURL('/project-map');
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();
  });
});
