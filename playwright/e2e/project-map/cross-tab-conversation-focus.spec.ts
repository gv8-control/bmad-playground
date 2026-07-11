import { test, expect, type Page } from '../../support/merged-fixtures';

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

async function waitForPresenceBroadcast(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const w = window as unknown as Record<string, unknown>;
    return w.__presenceReceived === true;
  });
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

    await conversationPage.waitForFunction(() => {
      const w = window as unknown as Record<string, unknown>;
      return w.__focusCalled === true;
    });

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
