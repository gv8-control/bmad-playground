import { type Page } from '@playwright/test';
import { test, expect } from '../../support/merged-fixtures';
import { setupStreamingMocks, type MockHandle } from '../../support/streaming-mocks';

/**
 * Story 3.5: Focus existing Conversation tab from Project Map (AC-3, FR8)
 *
 * E2E tests for the cross-tab conversation focus behavior. When a
 * Conversation is already open in another browser tab, clicking an
 * in-progress Artifact on the Project Map focuses that Conversation tab
 * instead of opening the Artifact Browser.
 *
 * Cross-tab communication uses the BroadcastChannel API:
 * - `useConversationPresence` (conversation page) broadcasts
 *   `conversation-opened` on mount and listens for `focus-conversation`.
 * - `useOpenConversations` (project map) tracks open conversation IDs.
 * - `InProgressArtifactCard` calls `preventDefault()` + broadcasts
 *   `focus-conversation` when `openConversations.length > 0`.
 *
 * The conversation page is mocked (EventSource + fetch) so it doesn't
 * hang waiting for a real SSE connection. The project map page reads
 * real seeded artifacts from Postgres.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

async function setupResumeMocks(page: Page): Promise<MockHandle> {
  const mocks = await setupStreamingMocks(page, {
    conversationId: 'resumed',
    skills: [],
    defaultRoutes: false,
    routes: [
      {
        urlIncludes: '/resume',
        method: 'POST',
        status: 200,
        body: { conversationId: 'resumed', sandboxStatus: 'provisioning' },
      },
      {
        urlIncludes: '/skills',
        method: 'GET',
        status: 200,
        body: [],
      },
    ],
  });

  // Focus spy: intercepts window.focus() so the test can assert the
  // conversation tab was focused (not navigated away from).
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    if (!w.__focusSpyInstalled) {
      w.__focusSpyInstalled = true;
      w.__focusCalled = false;
      const originalFocus = window.focus.bind(window);
      w.focus = function focus() {
        w.__focusCalled = true;
        return originalFocus();
      };
    }
  });

  return mocks;
}

async function waitForPresenceBroadcast(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as Record<string, unknown>;
      return w.__presenceReceived === true;
    },
    undefined,
    { timeout: 15_000 },
  );
}

test.describe('Story 3.5: Cross-tab Conversation Focus from Project Map (AC-3, FR8)', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] clicking an in-progress artifact with an open conversation tab focuses the conversation tab instead of navigating (AC-3, FR8)', async ({
    page: conversationPage,
    context,
    withArtifacts,
    withConversationAndTurns,
  }) => {
    const projectMapPage = await context.newPage();

    await projectMapPage.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__presenceReceived = false;
      const channel = new BroadcastChannel('bmad-easy-conversations');
      channel.addEventListener('message', (event: MessageEvent) => {
        const data = event.data;
        if (data && typeof data === 'object' && data.type === 'conversation-opened') {
          w.__presenceReceived = true;
        }
      });
    });

    await projectMapPage.goto('/project-map');
    await expect(projectMapPage.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    const mocks = await setupResumeMocks(conversationPage);
    await conversationPage.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await waitForPresenceBroadcast(projectMapPage);

    const architectureCard = projectMapPage
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Architecture' });
    await expect(architectureCard).toBeVisible();

    await architectureCard.click();

    await expect(projectMapPage).toHaveURL('/project-map');

    await conversationPage.waitForFunction(
      () => {
        const w = window as unknown as Record<string, unknown>;
        return w.__focusCalled === true;
      },
      undefined,
      { timeout: 15_000 },
    );

    const focusCalled = await conversationPage.evaluate(() => {
      return (window as unknown as Record<string, unknown>).__focusCalled === true;
    });
    expect(focusCalled).toBe(true);
  });

  test('[P0] clicking an in-progress artifact with NO open conversation tab navigates to the Artifact Browser (AC-3, FR8)', async ({
    page,
    withArtifacts,
  }) => {
    await page.goto('/project-map');
    await expect(page.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    const architectureCard = page
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Architecture' });
    await expect(architectureCard).toBeVisible();

    await architectureCard.click();

    await expect(page).toHaveURL(/\/artifacts\?id=.+/);
    await expect(page.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();
  });

  test('[P0] clicking a completed artifact always navigates to the Artifact Browser regardless of open conversations (AC-3)', async ({
    page: conversationPage,
    context,
    withArtifacts,
    withConversationAndTurns,
  }) => {
    const projectMapPage = await context.newPage();

    await projectMapPage.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__presenceReceived = false;
      const channel = new BroadcastChannel('bmad-easy-conversations');
      channel.addEventListener('message', (event: MessageEvent) => {
        const data = event.data;
        if (data && typeof data === 'object' && data.type === 'conversation-opened') {
          w.__presenceReceived = true;
        }
      });
    });

    await projectMapPage.goto('/project-map');
    await expect(projectMapPage.getByRole('heading', { name: 'Project Map' })).toBeVisible();

    const mocks = await setupResumeMocks(conversationPage);
    await conversationPage.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await waitForPresenceBroadcast(projectMapPage);

    const prdCard = projectMapPage
      .getByRole('listitem')
      .filter({ hasText: 'bmad-easy Product Requirements' });
    await expect(prdCard).toBeVisible();

    await prdCard.click();

    await expect(projectMapPage).toHaveURL(/\/artifacts\?id=.+/);
    await expect(projectMapPage.getByRole('heading', { name: 'Artifact Browser' })).toBeVisible();
  });
});
