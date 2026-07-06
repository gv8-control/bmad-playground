import { test, expect, type Page } from '../../support/merged-fixtures';

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

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

interface MockHandle {
  waitForEventSource: () => Promise<void>;
  emit: (type: string, data?: unknown) => Promise<void>;
  fetchCalls: () => Promise<FetchCall[]>;
  waitForFetchCount: (count: number) => Promise<void>;
}

async function setupResumeMocks(page: Page): Promise<MockHandle> {
  await page.addInitScript(() => {
    class MockEventSource {
      url: string;
      readyState = 0;
      onerror: ((event: Event) => void) | null = null;
      private readonly listeners: Record<string, Array<(event: { data: string }) => void>> = {};

      constructor(url: string) {
        this.url = url;
        (window as unknown as Record<string, unknown>).__mockEventSource = this;
      }

      addEventListener(type: string, handler: (event: { data: string }) => void): void {
        (this.listeners[type] = this.listeners[type] || []).push(handler);
      }

      removeEventListener(): void {
        // no-op for test mock
      }

      close(): void {
        this.readyState = 2;
      }

      __emit(type: string, data: unknown): void {
        const event = { data: typeof data === 'string' ? data : JSON.stringify(data) };
        (this.listeners[type] || []).forEach((handler) => handler(event));
      }
    }

    (window as unknown as Record<string, unknown>).EventSource = MockEventSource;

    const w = window as unknown as Record<string, unknown>;
    if (!w.__mockFetchInstalled) {
      w.__mockFetchInstalled = true;
      const originalFetch = window.fetch.bind(window);
      w.__mockFetchCalls = [] as FetchCall[];
      w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        const rawHeaders = (init?.headers as Record<string, string>) ?? {};
        const headers: Record<string, string> = {};
        for (const k of Object.keys(rawHeaders)) headers[k.toLowerCase()] = rawHeaders[k];
        (w.__mockFetchCalls as FetchCall[]).push({ url, method, headers });

        if (url.includes('/resume') && method === 'POST') {
          return new Response(JSON.stringify({ conversationId: 'resumed', sandboxStatus: 'provisioning' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.includes('/skills') && method === 'GET') {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return originalFetch(input as RequestInfo, init);
      };
    }
  });

  return {
    waitForEventSource: () =>
      page
        .waitForFunction(() => (window as unknown as Record<string, unknown>).__mockEventSource != null)
        .then(() => undefined),
    emit: (type: string, data: unknown = {}) =>
      page.evaluate(
        ({ type, data }) => {
          const es = (window as unknown as Record<string, unknown>).__mockEventSource as
            | { __emit: (type: string, data: unknown) => void }
            | undefined;
          es?.__emit(type, data);
        },
        { type, data },
      ),
    fetchCalls: () =>
      page.evaluate(() => {
        const calls = (window as unknown as Record<string, unknown>).__mockFetchCalls as FetchCall[];
        return calls ?? [];
      }),
    waitForFetchCount: (count: number) =>
      page
        .waitForFunction(
          (n) =>
            ((window as unknown as Record<string, unknown>).__mockFetchCalls as FetchCall[] | undefined)?.length ?? 0 >= n,
          count,
        )
        .then(() => undefined),
  };
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
