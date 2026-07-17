import { test, expect } from '../../support/merged-fixtures';
import type { Page } from '@playwright/test';

/**
 * ATDD — Story 6.5: Real-Service E2E Verification (Task 2.1, P5)
 *
 * Auto-scroll regression guard: Retry button visibility on SESSION_TIMEOUT
 * while the user is scrolled up.
 *
 * Tags: [P1] (defense-in-depth regression guard, not an AC).
 *
 * Background:
 *   Epic 5 M1 fixed an auto-scroll regression where the Retry button could be
 *   hidden or scrolled out of view when a SESSION_TIMEOUT fired while the user
 *   was scrolled up. The fix landed but no regression E2E test was added. This
 *   spec combines the auto-scroll scenario (from streaming-chat.spec.ts) with
 *   the SESSION_TIMEOUT + Retry scenario (from sandbox-lifecycle.spec.ts) to
 *   guard against the regression recurring.
 *
 * Tier: PR-tier (fake-backed). Uses the setupStreamingMocks pattern from
 * streaming-chat.spec.ts — no PLAYWRIGHT_REAL_SERVICE needed.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByTestId (no CSS classes or XPath).
 */

const CONVERSATION_ID = 'conv-auto-scroll-timeout';
const TURN_TITLE = 'Auto-scroll timeout';

const MOCK_SKILLS = [{ name: 'bmad-prd' }, { name: 'bmad-ux' }];

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

async function setupStreamingMocks(
  page: Page,
  options: {
    conversationId?: string;
    skills?: typeof MOCK_SKILLS;
    turnTitle?: string;
  } = {},
): Promise<MockHandle> {
  const {
    conversationId = CONVERSATION_ID,
    skills = MOCK_SKILLS,
    turnTitle = TURN_TITLE,
  } = options;

  await page.addInitScript(
    ({ conversationId, skills, turnTitle }) => {
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
        w.__mockSkills = skills;
        w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          const method = init?.method ?? 'GET';
          const rawHeaders = (init?.headers as Record<string, string>) ?? {};
          const headers: Record<string, string> = {};
          for (const k of Object.keys(rawHeaders)) headers[k.toLowerCase()] = rawHeaders[k];
          (w.__mockFetchCalls as FetchCall[]).push({ url, method, headers });

          if (url.includes('/stop') && method === 'POST') {
            return new Response(JSON.stringify({ conversationId, stopped: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (url.includes('/turns') && method === 'POST') {
            return new Response(JSON.stringify({ conversationId, title: turnTitle }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (url.includes('/skills') && method === 'GET') {
            return new Response(JSON.stringify(w.__mockSkills), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (url.includes('/api/conversations') && method === 'POST') {
            return new Response(JSON.stringify({ id: conversationId }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          return originalFetch(input as RequestInfo, init);
        };
      }
    },
    { conversationId, skills, turnTitle },
  );

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

async function readySession(mocks: MockHandle): Promise<void> {
  await mocks.waitForEventSource();
  await mocks.emit('SESSION_READY', { sandboxId: 'sb-1' });
  await mocks.waitForFetchCount(2);
}

test.describe('Story 6.5 (P5): auto-scroll regression — Retry visible on SESSION_TIMEOUT while scrolled up', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P1] Retry button stays visible when SESSION_TIMEOUT fires while scrolled up (Epic 5 M1 regression guard)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });

    // Stream enough content to make the message list overflow (must exceed the
    // 50px threshold in handleScroll so scrolling to top is detected as
    // "not at bottom"). Mirrors streaming-chat.spec.ts auto-scroll scenario.
    await mocks.emit('TEXT_MESSAGE_CONTENT', {
      messageId: 'msg-1',
      delta: Array.from({ length: 60 }, (_, i) => `Line ${i} of the story. `.repeat(5)).join(''),
    });

    // Verify we're at the bottom first (auto-scroll followed the stream).
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="chat-message-list"]') as HTMLElement | null;
        if (!el) return false;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      },
      undefined,
      { timeout: 5_000 },
    );

    // Scroll up to pause auto-scroll (simulates the user reading earlier content).
    await page
      .getByTestId('chat-message-list')
      .evaluate((el) => {
        el.scrollTop = 0;
      });

    // Confirm the scroll-to-bottom button appears (isAtBottomRef is false).
    await expect(page.getByRole('button', { name: /scroll to bottom/i })).toBeVisible();

    // ─── Fire SESSION_TIMEOUT while scrolled up ───────────────────────────
    // This is the regression case: the auto-scroll behavior must NOT hide the
    // Retry button when SESSION_TIMEOUT fires while the user is scrolled up.
    await mocks.emit('SESSION_TIMEOUT');

    // The "taking longer than expected" message must be visible.
    await expect(page.getByText(/taking longer than expected/i)).toBeVisible();

    // The Retry button must be visible — NOT hidden by auto-scroll behavior.
    // This is the core regression assertion: the Retry button is reachable
    // regardless of scroll position.
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
