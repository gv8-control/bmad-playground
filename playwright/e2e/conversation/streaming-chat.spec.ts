import { test, expect, type Page } from '../../support/merged-fixtures';

/**
 * Story 3.3: Converse with the Streaming Agent
 *
 * E2E tests for streaming chat: AG-UI event rendering, thinking/tool
 * indicators, Stop button, copy actions, draft persistence, and
 * auto-growing textarea keyboard shortcuts.
 *
 * Covers AC-1 (streaming + indicators), AC-2 (auto-growing input),
 * AC-3 (Stop button), AC-4 (copy + timestamps), AC-6 (draft persistence).
 *
 * The browser calls agent-be directly (POST /api/conversations, SSE,
 * POST /:id/turns, POST /:id/stop). Both `fetch` and `EventSource` are
 * mocked from the page so the tests exercise the real ConversationPane
 * state machine without a live Daytona provision or a real Claude agent.
 * agent-be still starts (via the playwright webServer block) so the
 * page's boundary-JWT mint path runs against the real AUTH_SECRET.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

const CONVERSATION_ID = 'conv-e2e-streaming';
const TURN_TITLE = 'Semantic Title';

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
  getLocalStorage: (key: string) => Promise<string | null>;
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
    getLocalStorage: (key: string) =>
      page.evaluate((key) => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      }, key),
  };
}

async function readySession(mocks: MockHandle): Promise<void> {
  await mocks.waitForEventSource();
  await mocks.emit('SESSION_READY', { sandboxId: 'sb-1' });
  await mocks.waitForFetchCount(2);
}

async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await input.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test.describe('Story 3.3: Streaming Chat', () => {
  test.describe.configure({ mode: 'serial' });

  // ─── AC-1: Streaming agent response with indicators ───

  test('[P0] RUN_STARTED shows thinking indicator with three-dot animation (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'hello');

    await mocks.emit('RUN_STARTED');

    await expect(page.getByText('Agent is thinking')).toBeVisible();
  });

  test('[P0] TEXT_MESSAGE_CONTENT events progressively render the agent response (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'what is 2+2');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
    await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'The answer ' });

    await expect(page.getByText('The answer', { exact: false })).toBeVisible();

    await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'is 4.' });

    await expect(page.getByText('The answer is 4.', { exact: false })).toBeVisible();

    await mocks.emit('TEXT_MESSAGE_END');
    await mocks.emit('RUN_FINISHED');
  });

  test('[P0] TOOL_CALL_START shows tool execution indicator with tool name (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'run a tool');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolName: 'read_file' });

    await expect(page.getByText('Running… read_file')).toBeVisible();
  });

  test('[P0] RUN_FINISHED hides thinking indicator and re-enables Send button (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'hello');

    await mocks.emit('RUN_STARTED');
    await expect(page.getByText('Agent is thinking')).toBeVisible();

    await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
    await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Done.' });
    await mocks.emit('TEXT_MESSAGE_END');
    await mocks.emit('RUN_FINISHED');

    await expect(page.getByText('Agent is thinking')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });

  test('[P1] RUN_ERROR shows error message in the message stream (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'hello');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('RUN_ERROR', { message: 'Something went wrong.' });

    await expect(page.getByText('Something went wrong.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });

  // ─── AC-2: Auto-growing chat input ───

  test('[P0] Enter sends the message without Shift (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('hello via enter');
    await input.press('Enter');

    await mocks.waitForFetchCount(3);

    const calls = await mocks.fetchCalls();
    const turnCall = calls.find((c) => c.url.includes('/turns') && c.method === 'POST');
    expect(turnCall).toBeDefined();
  });

  test('[P0] Shift+Enter inserts a newline and does not send (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('first line');
    await input.press('Shift+Enter');
    await input.type('second line');

    const calls = await mocks.fetchCalls();
    const turnCall = calls.find((c) => c.url.includes('/turns') && c.method === 'POST');
    expect(turnCall).toBeUndefined();

    const inputValue = await input.inputValue();
    expect(inputValue).toContain('second line');
  });

  // ─── AC-3: Stop button ───

  test('[P0] Stop button appears when agent is processing (AC-3)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'hello');

    await mocks.emit('RUN_STARTED');

    await expect(page.getByRole('button', { name: 'Stop agent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toHaveCount(0);
  });

  test('[P0] clicking Stop calls POST /:id/stop with Bearer JWT (AC-3)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'hello');

    await mocks.emit('RUN_STARTED');
    await expect(page.getByRole('button', { name: 'Stop agent' })).toBeVisible();

    await page.getByRole('button', { name: 'Stop agent' }).click();

    await mocks.waitForFetchCount(3);

    const calls = await mocks.fetchCalls();
    const stopCall = calls.find((c) => c.url.includes('/stop') && c.method === 'POST');
    expect(stopCall).toBeDefined();
    expect(stopCall?.url).toContain(`/api/conversations/${CONVERSATION_ID}/stop`);
    expect(stopCall?.headers.authorization).toMatch(/^Bearer .+/);
  });

  test('[P0] after Stop, Send button reappears and user can send a new message (AC-3)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'first message');

    await mocks.emit('RUN_STARTED');
    await expect(page.getByRole('button', { name: 'Stop agent' })).toBeVisible();

    await page.getByRole('button', { name: 'Stop agent' }).click();

    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('second message');
    await page.getByRole('button', { name: 'Send' }).click();

    await mocks.waitForFetchCount(4);

    const calls = await mocks.fetchCalls();
    const turnCalls = calls.filter((c) => c.url.includes('/turns') && c.method === 'POST');
    expect(turnCalls.length).toBeGreaterThanOrEqual(2);
  });

  // ─── AC-4: Copy actions and timestamps ───

  test('[P0] copy button copies message content to clipboard (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'copy me please');

    const copyButton = page.getByRole('button', { name: 'Copy to clipboard' }).first();
    await copyButton.click();

    await expect(page.getByText('Copied')).toBeVisible();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('copy me please');
  });

  test('[P0] timestamp is visible on hover over user message (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'timestamp test');

    const userMessage = page.locator('.group', { hasText: 'timestamp test' }).first();
    await userMessage.hover();

    const timePattern = /\d{2}:\d{2}/;
    await expect(userMessage.getByText(timePattern)).toBeVisible();
  });

  // ─── AC-6: Draft persistence keyed by conversationId ───

  test('[P0] draft is restored from localStorage on page reload (AC-6)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('unsent draft text');

    await expect(
      mocks.getLocalStorage(`conversation-${CONVERSATION_ID}-draft`),
    ).resolves.toBe('unsent draft text');

    await page.reload();

    await mocks.waitForEventSource();
    await mocks.emit('SESSION_READY', { sandboxId: 'sb-1' });

    const inputAfterReload = page.getByRole('textbox', { name: 'Message input' });
    await expect(inputAfterReload).toHaveValue('unsent draft text');
  });

  test('[P0] draft is cleared from localStorage on successful send (AC-6)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('draft to clear');

    await expect(
      mocks.getLocalStorage(`conversation-${CONVERSATION_ID}-draft`),
    ).resolves.toBe('draft to clear');

    await page.getByRole('button', { name: 'Send' }).click();

    await mocks.waitForFetchCount(3);

    await expect(input).toHaveValue('');

    const storedAfter = await mocks.getLocalStorage(`conversation-${CONVERSATION_ID}-draft`);
    expect(storedAfter === null || storedAfter === '').toBeTruthy();
  });
});
