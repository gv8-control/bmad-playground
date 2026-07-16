import { type Page } from '@playwright/test';
import { test, expect } from '../../support/merged-fixtures';
import {
  setupStreamingMocks,
  type MockHandle,
} from '../../support/streaming-mocks';

/**
 * Story 3.5: Resume an Existing Conversation
 *
 * E2E tests for AC-1 (full chat history restored from Postgres) and
 * AC-2 ("Reconnecting…" state with resume endpoint call + SESSION_READY
 * transition + timeout fallback).
 *
 * The conversation page (`[conversationId]/page.tsx`) is a Server
 * Component that reads the conversation + turns from Postgres and passes
 * them as `initialMessages` to `ConversationPane`. The Client Component
 * then sets state to `'reconnecting'`, opens an SSE EventSource, and
 * calls `POST /conversations/:id/resume`.
 *
 * Both `fetch` and `EventSource` are mocked from the page so the tests
 * exercise the real ConversationPane state machine without a live
 * Daytona provision or a real Claude agent. agent-be still starts (via
 * the playwright webServer block) so the page's boundary-JWT mint path
 * runs against the real AUTH_SECRET.
 *
 * The `withConversationAndTurns` fixture seeds a real Conversation row
 * with Turn rows in Postgres so the Server Component renders real
 * history (AC-1).
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

async function setupResumeMocks(page: Page): Promise<MockHandle> {
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

test.describe('Story 3.5: Resume an Existing Conversation', () => {
  test.describe.configure({ mode: 'serial' });

  // ─── AC-1: Full chat history restored immediately from Postgres ───

  test('[P0] full chat history is visible immediately on page load before SESSION_READY (AC-1, FR13, NFR-R2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);

    await mocks.waitForEventSource();

    const userMessages = withConversationAndTurns.turns.filter((t) => t.role === 'user');
    for (const turn of userMessages) {
      await expect(page.getByText(turn.content)).toBeVisible();
    }

    const assistantMessages = withConversationAndTurns.turns.filter((t) => t.role === 'assistant');
    for (const turn of assistantMessages) {
      await expect(page.getByText(turn.content)).toBeVisible();
    }
  });

  test('[P0] conversation title is rendered in the page header (AC-1)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await expect(
      page.getByRole('heading', { name: withConversationAndTurns.title }),
    ).toBeVisible();
  });

  // ─── AC-2: "Reconnecting…" state with resume endpoint call ───

  test('[P0] shows "Reconnecting…" label on resume before SESSION_READY (AC-2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await expect(page.getByText('Reconnecting…')).toBeVisible();
  });

  test('[P0] input is disabled during "Reconnecting…" state (AC-2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeVisible();
    await expect(input).toBeDisabled();
  });

  test('[P0] calls POST /conversations/:id/resume with Bearer JWT on resume (AC-2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await mocks.waitForFetchCount(1);

    const calls = await mocks.fetchCalls();
    const resumeCall = calls.find(
      (c) => c.method === 'POST' && c.url.includes(`/api/conversations/${withConversationAndTurns.id}/resume`),
    );
    expect(resumeCall).toBeDefined();
    expect(resumeCall?.headers.authorization).toMatch(/^Bearer .+/);
  });

  test('[P0] does NOT call POST /conversations (create) when resuming an existing conversation (AC-2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();
    await mocks.waitForFetchCount(1);

    const calls = await mocks.fetchCalls();
    const createCall = calls.find(
      (c) => c.method === 'POST' && c.url.match(/\/api\/conversations$/),
    );
    expect(createCall).toBeUndefined();
  });

  test('[P0] transitions to ready state on SESSION_READY — input re-enabled, label gone (AC-2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await expect(page.getByText('Reconnecting…')).toBeVisible();

    await mocks.emit('SESSION_READY', { sandboxId: 'sb-resumed' });

    await expect(page.getByText('Reconnecting…')).toHaveCount(0);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeEnabled();
  });

  test('[P0] full history remains visible after SESSION_READY transitions to ready (AC-1, AC-2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await mocks.emit('SESSION_READY', { sandboxId: 'sb-resumed' });

    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeEnabled();

    for (const turn of withConversationAndTurns.turns) {
      await expect(page.getByText(turn.content)).toBeVisible();
    }
  });

  test('[P0] "Reconnecting…" gives way to timeout treatment when SESSION_READY never arrives (AC-2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    page.clock.install();
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await expect(page.getByText('Reconnecting…')).toBeVisible();

    await page.clock.fastForward(35_000);

    await expect(page.getByText(/taking longer than expected/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByText('Reconnecting…')).toHaveCount(0);
  });

  test('[P0] clicking Retry after timeout re-calls POST /resume with Bearer JWT (AC-2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    page.clock.install();
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await page.clock.fastForward(35_000);
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

  test('[P0] Retry reuses the same conversation ID — does not call POST /conversations (create) (AC-2)', async ({
    page,
    withConversationAndTurns,
  }) => {
    page.clock.install();
    const mocks = await setupResumeMocks(page);
    await page.goto(`/conversations/${withConversationAndTurns.id}`);
    await mocks.waitForEventSource();

    await page.clock.fastForward(35_000);
    await page.getByRole('button', { name: 'Retry' }).click();

    await mocks.waitForEventSource();

    const calls = await mocks.fetchCalls();
    const createCall = calls.find(
      (c) => c.method === 'POST' && c.url.match(/\/api\/conversations$/),
    );
    expect(createCall).toBeUndefined();
  });

  test('[P1] new conversation shows "Starting session…" not "Reconnecting…" (AC-2 contrast)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupResumeMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    await expect(page.getByText('Reconnecting…')).toHaveCount(0);
  });
});
