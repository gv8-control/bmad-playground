import { test, expect, type Page } from '../../support/merged-fixtures';

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

async function setupLimitReachedMocks(page: Page): Promise<MockHandle> {
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
        if (url.includes('/api/conversations') && method === 'POST') {
          return new Response(
            JSON.stringify({
              code: 'CONVERSATION_LIMIT_REACHED',
              message: "You've reached the limit of 10 active conversations. Return to one of your existing conversations, or try again later.",
              meta: { limit: 10 },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          );
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
          (n) => ((window as unknown as Record<string, unknown>).__mockFetchCalls as FetchCall[] | undefined)?.length ?? 0 >= n,
          count,
        )
        .then(() => undefined),
  };
}

async function setupRetryCancelMocks(page: Page): Promise<MockHandle> {
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
        if (url.includes('/api/conversations') && method === 'POST') {
          return new Response(JSON.stringify({ id: 'conv-retry-1' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/api/conversations/') && method === 'DELETE') {
          return new Response(JSON.stringify({ conversationId: 'conv-retry-1', abandoned: true }), {
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
          (n) => ((window as unknown as Record<string, unknown>).__mockFetchCalls as FetchCall[] | undefined)?.length ?? 0 >= n,
          count,
        )
        .then(() => undefined),
  };
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
          // no-op
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

      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url.includes('/api/conversations') && method === 'POST') {
          return new Response(JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Something went wrong' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(input as RequestInfo, init);
      };
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
    withRepoConnection,
  }) => {
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
          // no-op
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
      w.__mockFetchCalls = [] as FetchCall[];
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        const rawHeaders = (init?.headers as Record<string, string>) ?? {};
        const headers: Record<string, string> = {};
        for (const k of Object.keys(rawHeaders)) headers[k.toLowerCase()] = rawHeaders[k];
        (w.__mockFetchCalls as FetchCall[]).push({ url, method, headers });
        if (url.includes('/resume')) {
          return new Response(JSON.stringify({ conversationId: 'conv-existing', sandboxStatus: 'provisioning' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(input as RequestInfo, init);
      };
    });

    await page.goto('/conversations/conv-existing');
    await page.waitForFunction(() => (window as unknown as Record<string, unknown>).__mockEventSource != null);

    const es = (await page.evaluate(() => (window as unknown as Record<string, unknown>).__mockEventSource)) as
      | { __emit: (type: string, data: unknown) => void }
      | undefined;
    es?.__emit('SESSION_TIMEOUT', {});

    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();

    const calls = (await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return (w.__mockFetchCalls as FetchCall[]) ?? [];
    })) as FetchCall[];
    const hasDelete = calls.some((c) => c.method === 'DELETE');
    expect(hasDelete).toBe(false);
  });
});
