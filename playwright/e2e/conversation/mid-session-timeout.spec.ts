import { type Page } from '@playwright/test';
import { test, expect } from '../../support/merged-fixtures';
import {
  setupStreamingMocks,
  type MockHandle,
} from '../../support/streaming-mocks';

/**
 * Story 3.9: Terminate Idle Sandboxes Mid-Conversation
 *
 * E2E tests for AC-3 (resume flow applies after mid-session teardown).
 *
 * Browser-level mock pattern: Playwright intercepts both EventSource and
 * fetch via page.addInitScript. The real ConversationPane state machine
 * runs in a real browser — no jsdom. The mock SSE stream emits
 * SESSION_READY then SESSION_TIMEOUT with { reason: 'mid-session' },
 * verifying the frontend's mid-session-specific message and Retry →
 * POST /resume flow.
 *
 * AC-1 and AC-2 (backend timer logic, dirty-tree save, destroy call)
 * are NOT covered by E2E — no browser-level mock can simulate the
 * backend Node.js timer or the sandboxService.destroy side effect.
 * Those ACs are covered by unit tests (conversations.service.spec.ts)
 * and integration tests (sandbox-lifecycle.integration.spec.ts).
 *
 * The `withConversationAndTurns` fixture seeds a real Conversation row
 * with Turn rows in Postgres so the Server Component renders real
 * history. agent-be starts (via the playwright webServer block) so
 * the page's boundary-JWT mint path runs against the real AUTH_SECRET.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage.
 */

async function setupMidSessionTimeoutMocks(page: Page): Promise<MockHandle> {
  return setupStreamingMocks(page, {
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
}

test.describe('Story 3.9: Mid-session idle timeout (AC-3)', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] shows "Your session expired due to inactivity." on mid-session SESSION_TIMEOUT (AC-3)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupMidSessionTimeoutMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await mocks.emit('SESSION_READY', { sandboxId: 'sb-1' });

    await mocks.emit('SESSION_TIMEOUT', { reason: 'mid-session' });

    await expect(page.getByText('Your session expired due to inactivity.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('[P0] clicking Retry after mid-session SESSION_TIMEOUT calls POST /resume with Bearer JWT (AC-3)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupMidSessionTimeoutMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await mocks.emit('SESSION_READY', { sandboxId: 'sb-1' });
    await mocks.emit('SESSION_TIMEOUT', { reason: 'mid-session' });

    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    const callsBefore = (await mocks.fetchCalls()).length;

    await page.getByRole('button', { name: 'Retry' }).click();

    await mocks.waitForFetchCount(callsBefore + 1);

    const calls = await mocks.fetchCalls();
    const retryResumeCall = calls.find(
      (c) =>
        c.method === 'POST' &&
        c.url.includes(`/api/conversations/${withConversationAndTurns.id}/resume`),
    );
    expect(retryResumeCall).toBeDefined();
    expect(retryResumeCall?.headers.authorization).toMatch(/^Bearer .+/);
  });

  test('[P0] shows "taking longer than expected" on pre-first-message SESSION_TIMEOUT (no reason field) — contrast with mid-session (AC-3)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupMidSessionTimeoutMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await mocks.emit('SESSION_READY', { sandboxId: 'sb-1' });

    await mocks.emit('SESSION_TIMEOUT', {});

    await expect(page.getByText(/taking longer than expected/i)).toBeVisible();
    await expect(page.getByText('Your session expired due to inactivity.')).toHaveCount(0);
  });
});
