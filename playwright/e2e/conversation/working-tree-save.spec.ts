import { test, expect, type Page } from '../../support/merged-fixtures';

/**
 * Story 3.6: Track and Manually Save Working Tree State
 *
 * E2E tests for the working tree indicator states, manual save
 * confirmation popover, Semantic Pill on success, error-state Tool Pill
 * on failure, queued save behind an in-progress agent turn, and the
 * info disclosure tooltip.
 *
 * Covers:
 *   AC-1 — Working tree indicator reflects git state (dirty/clean/hidden)
 *   AC-2 — Manual save via confirmation popover (Save/Cancel, POST /save)
 *   AC-3 — Queued save behind in-progress agent turn ("Saving after response…")
 *   AC-4 — Successful save produces Semantic Pill + resets indicator
 *   AC-5 — Failed save produces error-state Tool Pill + indicator stays dirty
 *   AC-6 — No-op on clean tree + duplicate submission prevention
 *   AC-7 — Help text on dirty indicator (info disclosure tooltip)
 *
 * The browser calls agent-be directly (POST /api/conversations, SSE,
 * POST /:id/turns, POST /:id/save). Both `fetch` and `EventSource` are
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

const CONVERSATION_ID = 'conv-e2e-working-tree';
const TURN_TITLE = 'Working Tree Test';

interface SaveResponse {
  committed: boolean;
  clean: boolean;
  queued: boolean;
}

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
  setSaveResponse: (response: SaveResponse) => Promise<void>;
}

async function setupStreamingMocks(
  page: Page,
  options: {
    conversationId?: string;
    turnTitle?: string;
  } = {},
): Promise<MockHandle> {
  const {
    conversationId = CONVERSATION_ID,
    turnTitle = TURN_TITLE,
  } = options;

  await page.addInitScript(
    ({ conversationId, turnTitle }) => {
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
        w.__saveResponse = { committed: true, clean: false, queued: false };
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

          if (url.includes('/save') && method === 'POST') {
            const saveResponse = w.__saveResponse as SaveResponse;
            return new Response(JSON.stringify(saveResponse), {
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
            return new Response(JSON.stringify([{ name: 'bmad-prd' }]), {
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
    { conversationId, turnTitle },
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
    setSaveResponse: (response: SaveResponse) =>
      page.evaluate((response) => {
        (window as unknown as Record<string, unknown>).__saveResponse = response;
      }, response),
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

test.describe('Story 3.6: Working Tree Indicator and Manual Save', () => {
  test.describe.configure({ mode: 'serial' });

  // ─── AC-1: Working tree indicator reflects git state ───

  test('[P0] indicator is hidden before session is ready (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await mocks.waitForEventSource();

    // Before SESSION_READY, effectiveWorkingTreeState is 'hidden' → indicator renders null
    await expect(page.getByText('Unsaved changes')).toHaveCount(0);
    await expect(page.getByText('All saved')).toHaveCount(0);
  });

  test('[P0] WORKING_TREE_DIRTY event shows dirty indicator (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });

    await expect(page.getByText('Unsaved changes')).toBeVisible();
  });

  test('[P0] WORKING_TREE_CLEAN event shows clean indicator (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
    await expect(page.getByText('Unsaved changes')).toBeVisible();

    await mocks.emit('WORKING_TREE_CLEAN', {});
    await expect(page.getByText('All saved')).toBeVisible();
  });

  // ─── AC-2: Manual save via confirmation popover ───

  test('[P0] clicking dirty indicator opens save popover (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });

    await page.getByText('Unsaved changes').click();

    const popover = page.getByRole('dialog', { name: 'Save current progress' });
    await expect(popover).toBeVisible();
    await expect(popover.getByText('Save current progress?')).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('[P0] clicking Save calls POST /conversations/:id/save (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
    await page.getByText('Unsaved changes').click();

    const popover = page.getByRole('dialog', { name: 'Save current progress' });
    await popover.getByRole('button', { name: 'Save' }).click();

    // The save fetch is the 3rd call (after create-conversation + skills)
    await mocks.waitForFetchCount(3);

    const calls = await mocks.fetchCalls();
    const saveCall = calls.find(
      (c) => c.method === 'POST' && c.url.includes('/save'),
    );
    expect(saveCall).toBeDefined();
    expect(saveCall!.headers['authorization']).toMatch(/^Bearer .+$/);
    expect(saveCall!.headers['content-type']).toBe('application/json');
  });

  test('[P0] Cancel closes popover without calling save (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
    await page.getByText('Unsaved changes').click();

    const popover = page.getByRole('dialog', { name: 'Save current progress' });
    await popover.getByRole('button', { name: 'Cancel' }).click();

    await expect(popover).toHaveCount(0);

    // No save fetch should have been made (only create-conversation + skills = 2)
    const calls = await mocks.fetchCalls();
    const saveCall = calls.find(
      (c) => c.method === 'POST' && c.url.includes('/save'),
    );
    expect(saveCall).toBeUndefined();
  });

  // ─── AC-3: Queued save behind in-progress agent turn ───

  test('[P0] queued save response shows "Saving after response..." (AC-3)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
    await page.getByText('Unsaved changes').click();

    await mocks.setSaveResponse({ committed: false, clean: false, queued: true });

    const popover = page.getByRole('dialog', { name: 'Save current progress' });
    await popover.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Saving after response...')).toBeVisible();
  });

  // ─── AC-4: Successful save produces Semantic Pill + resets indicator ───

  test('[P0] MANUAL_SAVE_SUCCEEDED shows Semantic Pill and resets indicator (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
    await page.getByText('Unsaved changes').click();

    // Default save response: { committed: true } — handleSave stays in 'saving' until SSE event
    const popover = page.getByRole('dialog', { name: 'Save current progress' });
    await popover.getByRole('button', { name: 'Save' }).click();

    // Wait for the save fetch to be initiated (3rd call after create + skills)
    await mocks.waitForFetchCount(3);

    // "Saving..." appears while waiting for the SSE confirmation
    await expect(page.getByText('Saving...')).toBeVisible();

    // Backend emits MANUAL_SAVE_SUCCEEDED after the commit
    await mocks.emit('MANUAL_SAVE_SUCCEEDED', {
      toolCallId: 'manual-save-1',
      timestamp: '2026-07-04T12:00:00.000Z',
    });

    // Semantic Pill appears with "Progress saved" (no View link, no type, no title)
    await expect(page.getByText('Progress saved')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View' })).toHaveCount(0);

    // Indicator resets to clean
    await expect(page.getByText('All saved')).toBeVisible();
  });

  // ─── AC-5: Failed save produces error-state Tool Pill + indicator stays dirty ───

  test('[P0] MANUAL_SAVE_FAILED shows error Tool Pill and keeps indicator dirty (AC-5)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
    await page.getByText('Unsaved changes').click();

    // Save response indicates failure (committed: false, clean: false, queued: false)
    await mocks.setSaveResponse({ committed: false, clean: false, queued: false });

    const popover = page.getByRole('dialog', { name: 'Save current progress' });
    await popover.getByRole('button', { name: 'Save' }).click();

    // Wait for the save fetch to be initiated (3rd call after create + skills)
    await mocks.waitForFetchCount(3);

    // Backend emits MANUAL_SAVE_FAILED after the commit fails
    await mocks.emit('MANUAL_SAVE_FAILED', {
      toolCallId: 'manual-save-fail-1',
      error: 'git commit failed: nothing to commit',
    });

    // Error-state Tool Pill appears with "Save failed"
    await expect(page.getByRole('button', { name: /Save failed/ })).toBeVisible();

    // Indicator stays dirty
    await expect(page.getByText('Unsaved changes')).toBeVisible();
  });

  // ─── AC-6: No-op on clean tree + duplicate submission prevention ───

  test('[P0] clean save response (no-op) sets indicator to clean (AC-6)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
    await page.getByText('Unsaved changes').click();

    // Save response indicates clean tree (no-op)
    await mocks.setSaveResponse({ committed: false, clean: true, queued: false });

    const popover = page.getByRole('dialog', { name: 'Save current progress' });
    await popover.getByRole('button', { name: 'Save' }).click();

    // Indicator resets to clean without a Semantic Pill (no commit happened)
    await expect(page.getByText('All saved')).toBeVisible();
    await expect(page.getByText('Progress saved')).toHaveCount(0);
  });

  test('[P0] "Saving..." text appears while save is in progress (AC-6)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
    await page.getByText('Unsaved changes').click();

    // Default save response: { committed: true } — state stays 'saving' until SSE event
    const popover = page.getByRole('dialog', { name: 'Save current progress' });
    await popover.getByRole('button', { name: 'Save' }).click();

    // The 'saving' state renders "Saving..." text (Save control is effectively disabled
    // because the popover is closed and the indicator shows non-interactive text)
    await expect(page.getByText('Saving...')).toBeVisible();
    await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  });

  // ─── AC-7: Help text on dirty indicator ───

  test('[P0] clicking info affordance opens help tooltip (AC-7)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });

    await page.getByRole('button', { name: 'Why does this matter?' }).click();

    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Unsaved changes are lost if you close this page');
    await expect(tooltip).toContainText('Saving commits them permanently to your repository');
  });

  test('[P1] info tooltip dismissible by Escape (AC-7)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });

    await page.getByRole('button', { name: 'Why does this matter?' }).click();
    await expect(page.getByRole('tooltip')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
});
