import { test, expect } from '../../support/merged-fixtures';

/**
 * Story 3.2: Side Nav Conversation List
 *
 * E2E tests for AC-4: conversations appear in the side nav with their
 * semantic titles, ordered by lastActiveAt desc, with the active
 * conversation highlighted.
 *
 * Uses the `withConversations` fixture to seed real Conversation rows
 * in Postgres (with titles). The layout Server Component fetches these
 * via Prisma and passes them to SideNavigation for rendering.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByTestId (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage.
 */

test.describe('Story 3.2: Side Nav Conversation List (AC-4)', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] side nav shows seeded conversations as links with titles (AC-4)', async ({
    page,
    withConversations,
  }) => {
    await page.goto('/project-map');

    const conversationList = page.getByTestId('conversation-list');
    await expect(conversationList).toBeVisible();

    for (const conv of withConversations) {
      const link = page.getByRole('link', { name: conv.title });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', `/conversations/${conv.id}`);
    }
  });

  test('[P0] side nav shows conversations ordered by lastActiveAt desc (AC-4)', async ({
    page,
    withConversations,
  }) => {
    await page.goto('/project-map');

    const links = page.getByTestId('conversation-list').getByRole('link');
    await expect(links).toHaveCount(3);

    await expect(links.nth(0)).toContainText(withConversations[2].title);
    await expect(links.nth(1)).toContainText(withConversations[1].title);
    await expect(links.nth(2)).toContainText(withConversations[0].title);
  });

  test('[P0] active conversation is highlighted in side nav (AC-4)', async ({
    page,
    withConversations,
  }) => {
    const targetConv = withConversations[1];
    await page.goto(`/conversations/${targetConv.id}`);

    const conversationList = page.getByTestId('conversation-list');
    await expect(conversationList).toBeVisible();

    const activeLink = page.getByRole('link', { name: targetConv.title });
    await expect(activeLink).toHaveClass(/bg-surface-raised/);
    await expect(activeLink).toHaveClass(/text-text-1/);
  });
});
