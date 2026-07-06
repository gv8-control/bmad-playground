import { test, expect, type Page } from '../../support/merged-fixtures';

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

async function setupMidSessionTimeoutMocks(page: Page): Promise<MockHandle> {
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
          return new Response(
            JSON.stringify({ conversationId: 'resumed', sandboxStatus: 'provisioning' }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
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
