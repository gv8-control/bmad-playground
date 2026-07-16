import { type Page } from '@playwright/test';
import { test, expect } from '../../support/merged-fixtures';
import {
  setupStreamingMocks,
  seedConversation,
  type MockHandle,
} from '../../support/streaming-mocks';

/**
 * Story 3.11: Run Concurrent Conversations
 *
 * E2E tests for the conversation limit-reached blocking state (AC-2) and
 * retry-cancels-in-flight-provisioning behavior (AC-4).
 *
 * Both ACs are browser-observable: a browser-level mock (page.addInitScript)
 * can intercept POST /api/conversations to return a 409, and can capture
 * fetch call ordering (DELETE before second POST) to verify retry cancellation.
 * Per user instruction, E2E coverage is NOT deferred for these ACs because
 * a browser-level mock pattern covers them.
 *
 * AC-1 (independent sandbox) and AC-3 (concurrent-turn guard) are backend-
 * internal and deferred to unit/integration — see ATDD checklist for the
 * browser-level mock verification analysis.
 *
 * The browser calls agent-be directly (POST /api/conversations + SSE).
 * Both `fetch` and `EventSource` are mocked from the page so the tests
 * exercise the real ConversationPane state machine without a live Daytona
 * provision or a real GitHub repo.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage.
 */

async function setupLimitReachedMocks(page: Page): Promise<MockHandle> {
  return setupStreamingMocks(page, {
    defaultRoutes: false,
    routes: [
      {
        urlIncludes: '/api/conversations',
        method: 'POST',
        status: 409,
        body: {
          code: 'CONVERSATION_LIMIT_REACHED',
          message: "You've reached the limit of 10 active conversations. Return to one of your existing conversations, or try again later.",
          meta: { limit: 10 },
        },
      },
    ],
  });
}

async function setupRetryCancelMocks(page: Page): Promise<MockHandle> {
  return setupStreamingMocks(page, {
    defaultRoutes: false,
    routes: [
      {
        urlIncludes: '/api/conversations',
        method: 'POST',
        status: 201,
        body: { id: 'conv-retry-1' },
      },
      {
        urlIncludes: '/api/conversations/',
        method: 'DELETE',
        status: 200,
        body: { conversationId: 'conv-retry-1', abandoned: true },
      },
    ],
  });
}

test.describe('Story 3.11: Concurrent conversations — limit-reached + retry-cancel (E2E)', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] limit-reached message renders when POST returns 409 CONVERSATION_LIMIT_REACHED (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    await setupLimitReachedMocks(page);
    await page.goto('/conversations/new');

    await expect(page.getByText(/reached the limit of 10 active conversations/i)).toBeVisible();
  });

  test('[P0] chat input hidden and no Retry button in limit-reached state (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    await setupLimitReachedMocks(page);
    await page.goto('/conversations/new');

    await expect(page.getByText(/reached the limit/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message input' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  });

  test('[P0] non-409 error shows generic error + Retry (AC-2 regression guard)', async ({
    page,
    withRepoConnection,
  }) => {
    await setupStreamingMocks(page, {
      defaultRoutes: false,
      routes: [
        {
          urlIncludes: '/api/conversations',
          method: 'POST',
          status: 500,
          body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
        },
      ],
    });

    await page.goto('/conversations/new');

    await expect(page.getByText(/Failed to create conversation/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('[P0] retry calls DELETE on old conversation before minting new (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupRetryCancelMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    await mocks.emit('SESSION_TIMEOUT', {});

    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();

    await mocks.waitForFetchCount(3);

    const calls = await mocks.fetchCalls();
    const deleteCallIndex = calls.findIndex((c) => c.method === 'DELETE');
    const postCalls = calls.filter((c) => c.method === 'POST');
    expect(deleteCallIndex).toBeGreaterThan(-1);
    expect(postCalls.length).toBeGreaterThanOrEqual(2);
    const secondPostIndex = calls.findIndex(
      (c, i) => i > deleteCallIndex && c.method === 'POST',
    );
    expect(secondPostIndex).toBeGreaterThan(deleteCallIndex);
  });

  test('[P0] retry does NOT call DELETE for existing conversation (AC-4)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const cleanup = await seedConversation(request, withRepoConnection.userId, 'conv-existing');

    try {
      const mocks = await setupStreamingMocks(page, {
        defaultRoutes: false,
        routes: [
          {
            urlIncludes: '/resume',
            method: 'POST',
            status: 200,
            body: { conversationId: 'conv-existing', sandboxStatus: 'provisioning' },
          },
        ],
      });

      await page.goto('/conversations/conv-existing');
      await mocks.waitForEventSource();

      await mocks.emit('SESSION_TIMEOUT', {});

      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
      await page.getByRole('button', { name: 'Retry' }).click();

      const calls = await mocks.fetchCalls();
      const hasDelete = calls.some((c) => c.method === 'DELETE');
      expect(hasDelete).toBe(false);
    } finally {
      await cleanup();
    }
  });
});
