import { type Page } from '@playwright/test';
import { test, expect } from '../../support/merged-fixtures';
import {
  setupStreamingMocks as baseSetupStreamingMocks,
  type MockHandle as BaseMockHandle,
} from '../../support/streaming-mocks';

/**
 * Story 3.1: Provision a Sandbox When Opening a Conversation
 *
 * E2E tests for the New Conversation page session-start lifecycle.
 * Covers AC-1 (provisioning on page open), AC-2 (queued first message),
 * and AC-5 (client-side session-start timeout / retry affordance).
 *
 * The browser calls agent-be directly (POST /api/conversations + SSE).
 * Both `fetch` and `EventSource` are mocked from the page so the tests
 * exercise the real ConversationPane state machine without a live
 * Daytona provision or a real GitHub repo. agent-be still starts (via
 * the playwright webServer block) so the page's boundary-JWT mint path
 * runs against the real AUTH_SECRET, but no browser request reaches it.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

const CONVERSATION_ID = 'conv-e2e-1';

interface MockHandle extends BaseMockHandle {
  eventSourceUrl: () => Promise<string | null>;
}

async function setupConversationMocks(page: Page): Promise<MockHandle> {
  const mocks = await baseSetupStreamingMocks(page, {
    conversationId: CONVERSATION_ID,
    defaultRoutes: false,
    routes: [
      {
        urlIncludes: '/api/conversations',
        method: 'POST',
        status: 201,
        body: { id: CONVERSATION_ID },
      },
    ],
  });
  return {
    ...mocks,
    eventSourceUrl: () =>
      page.evaluate(() => {
        const es = (window as unknown as Record<string, unknown>).__mockEventSource as { url: string } | undefined;
        return es?.url ?? null;
      }),
  };
}

test.describe('Story 3.1: Sandbox provisioning lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] New Conversation page renders heading, intro prompt, and active input during provisioning (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible();
    await expect(page.getByText(/browse available skills/)).toBeVisible();

    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  });

  test('[P0] browser POSTs to /api/conversations with Bearer boundary JWT on mount (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    const calls = await mocks.fetchCalls();
    const post = calls.find((c) => c.method === 'POST' && c.url.includes('/api/conversations'));
    expect(post).toBeDefined();
    expect(post?.url).toMatch(/\/api\/conversations$/);
    expect(post?.headers.authorization).toMatch(/^Bearer .+/);
  });

  test('[P0] opens EventSource to the conversations events URL with token query param (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    const url = (await mocks.eventSourceUrl()) ?? '';
    expect(url).toContain(`/api/conversations/${CONVERSATION_ID}/events`);
    expect(url).toMatch(/[?&]token=.+/);
  });

  test('[P0] message submitted during provisioning shows spinner, then clears after SESSION_READY (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    await expect(page.getByText(/Starting session/)).toHaveCount(0);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('hello world');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(/Starting session/)).toBeVisible();

    await mocks.emit('SESSION_READY', { sandboxId: 'sb-1' });

    await expect(page.getByText(/Starting session/)).toHaveCount(0);
    await expect(input).toBeEnabled();
  });

  test('[P0] SESSION_ERROR event displays the error message to the user (AC-5)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    await mocks.emit('SESSION_ERROR', { message: 'Daytona provisioning failed' });

    await expect(page.getByText('Daytona provisioning failed')).toBeVisible();
  });

  test('[P0] SESSION_TIMEOUT event shows "taking longer" message and Retry button (AC-5)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    await mocks.emit('SESSION_TIMEOUT');

    await expect(page.getByText(/taking longer than expected/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('[P1] clicking Retry re-attempts session start (AC-5)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    await mocks.emit('SESSION_TIMEOUT');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    await page.getByRole('button', { name: 'Retry' }).click();

    await mocks.waitForFetchCount(2);

    const calls = await mocks.fetchCalls();
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[1]?.headers.authorization).toMatch(/^Bearer .+/);
  });
});
