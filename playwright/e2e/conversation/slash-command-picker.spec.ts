import { test, expect, type Page } from '../../support/merged-fixtures';

/**
 * Story 3.2: Invoke BMAD Skills via Slash Command
 *
 * E2E tests for the Slash Command Picker, message sending, and URL transition.
 * Covers AC-1 (picker opens on `/`), AC-2 (empty skills state),
 * AC-3 (message persistence via POST /:id/turns), and AC-4 (URL transition).
 *
 * The browser calls agent-be directly (POST /api/conversations, GET /:id/skills,
 * POST /:id/turns + SSE). Both `fetch` and `EventSource` are mocked from the
 * page so the tests exercise the real ConversationPane state machine without
 * a live Daytona provision or a real GitHub repo. agent-be still starts (via
 * the playwright webServer block) so the page's boundary-JWT mint path runs
 * against the real AUTH_SECRET, but no browser request reaches it.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

const MOCK_SKILLS = [
  { name: 'bmad-prd' },
  { name: 'bmad-agent-pm' },
  { name: 'bmad-agent-architect' },
  { name: 'bmad-ux' },
  { name: 'bmad-help' },
];

const CONVERSATION_ID = 'conv-e2e-picker';
const TURN_TITLE = 'Semantic Title';

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

async function setupConversationMocks(
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
    { conversationId, skills, turnTitle } as {
      conversationId: string;
      skills: typeof MOCK_SKILLS;
      turnTitle: string;
    },
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

test.describe('Story 3.2: Slash Command Picker', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] picker opens on `/` and lists available skills (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');

    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(5);
    for (const skill of MOCK_SKILLS) {
      await expect(page.getByRole('option', { name: skill.name })).toBeVisible();
    }
  });

  test('[P0] typing after `/` narrows the list by skill-name prefix (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/bmad-a');

    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(2);
    await expect(page.getByRole('option', { name: 'bmad-agent-pm' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'bmad-agent-architect' })).toBeVisible();
  });

  test('[P0] ArrowDown moves focus to next skill in picker (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    const options = page.getByRole('option');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    await input.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');

    await input.press('ArrowDown');
    await expect(options.nth(2)).toHaveAttribute('aria-selected', 'true');
  });

  test('[P0] ArrowUp wraps focus from first to last skill (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    const options = page.getByRole('option');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    await input.press('ArrowUp');
    await expect(options.nth(4)).toHaveAttribute('aria-selected', 'true');
  });

  test('[P0] Enter selects focused skill and appends /{name} to input (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    await input.press('ArrowDown');
    await input.press('Enter');

    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(input).toHaveValue('/bmad-agent-pm ');
    await expect(input).toBeFocused();
  });

  test('[P0] Escape dismisses the picker (AC-1)', async ({ page, withRepoConnection }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    await input.press('Escape');

    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(input).toBeFocused();
  });

  test('[P1] outside click dismisses the picker (AC-1)', async ({ page, withRepoConnection }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.getByText('Press `/` to browse available skills').click();

    await expect(page.getByRole('listbox')).toHaveCount(0);
  });

  test('[P0] picker shows "No skills found" when skills array is empty (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page, { skills: [] });
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');

    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByText('No skills found in this repository.')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(0);
  });

  test('[P0] sending a message calls POST /:id/turns with Bearer JWT and transitions URL (AC-3, AC-4)', async ({
    page,
    withConversations,
  }) => {
    const convId = withConversations[0].id;
    const mocks = await setupConversationMocks(page, { conversationId: convId });
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('hello world');
    await page.getByRole('button', { name: 'Send' }).click();

    await mocks.waitForFetchCount(3);

    const calls = await mocks.fetchCalls();
    const turnCall = calls.find((c) => c.url.includes('/turns') && c.method === 'POST');
    expect(turnCall).toBeDefined();
    expect(turnCall?.url).toContain(`/api/conversations/${convId}/turns`);
    expect(turnCall?.headers.authorization).toMatch(/^Bearer .+/);

    await expect(page).toHaveURL(new RegExp(`/conversations/${convId}`));
  });
});
