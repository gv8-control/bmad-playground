import { type Page } from '@playwright/test';
import { test, expect } from '../../support/merged-fixtures';
import {
  setupStreamingMocks as baseSetupStreamingMocks,
  setupReadySession,
  readySession,
  sendMessage,
  type MockHandle as BaseMockHandle,
} from '../../support/streaming-mocks';

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

interface MockHandle extends BaseMockHandle {
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
  const mocks = await baseSetupStreamingMocks(page, {
    conversationId: options.conversationId ?? CONVERSATION_ID,
    turnTitle: options.turnTitle ?? TURN_TITLE,
    skills: options.skills ?? MOCK_SKILLS,
  });
  return {
    ...mocks,
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

test.describe('Story 3.3: Streaming Chat', () => {
  test.describe.configure({ mode: 'serial' });

  // ─── AC-1: Streaming agent response with indicators ───

  test('[P0] RUN_STARTED shows thinking indicator with three-dot animation (AC-1)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'hello');

      await mocks.emit('RUN_STARTED');

      await expect(page.getByText('Agent is thinking')).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] TEXT_MESSAGE_CONTENT events progressively render the agent response (AC-1)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'what is 2+2');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
      await mocks.emit('TEXT_MESSAGE_CONTENT', {
        messageId: 'msg-1',
        delta: 'The answer ',
      });

      await expect(
        page.getByText('The answer', { exact: false }),
      ).toBeVisible();

      await mocks.emit('TEXT_MESSAGE_CONTENT', {
        messageId: 'msg-1',
        delta: 'is 4.',
      });

      await expect(
        page.getByText('The answer is 4.', { exact: false }),
      ).toBeVisible();

      await mocks.emit('TEXT_MESSAGE_END');
      await mocks.emit('RUN_FINISHED');
    } finally {
      await cleanup();
    }
  });

  test('[P0] TOOL_CALL_START shows running Tool Pill with tool name (AC-1)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'run a tool');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'read_file',
      });

      await expect(page.getByText('Running… read_file')).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] RUN_FINISHED hides thinking indicator and re-enables Send button (AC-1)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'hello');

      await mocks.emit('RUN_STARTED');
      await expect(page.getByText('Agent is thinking')).toBeVisible();

      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
      await mocks.emit('TEXT_MESSAGE_CONTENT', {
        messageId: 'msg-1',
        delta: 'Done.',
      });
      await mocks.emit('TEXT_MESSAGE_END');
      await mocks.emit('RUN_FINISHED');

      await expect(page.getByText('Agent is thinking')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P1] RUN_ERROR shows error message in the message stream (AC-1)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'hello');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('RUN_ERROR', { message: 'Something went wrong.' });

      await expect(page.getByText('Something went wrong.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    } finally {
      await cleanup();
    }
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
    const turnCall = calls.find(
      (c) => c.url.includes('/turns') && c.method === 'POST',
    );
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
    const turnCall = calls.find(
      (c) => c.url.includes('/turns') && c.method === 'POST',
    );
    expect(turnCall).toBeUndefined();

    const inputValue = await input.inputValue();
    expect(inputValue).toContain('second line');
  });

  // ─── AC-3: Stop button ───

  test('[P0] Stop button appears when agent is processing (AC-3)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'hello');

      await mocks.emit('RUN_STARTED');

      await expect(
        page.getByRole('button', { name: 'Stop agent' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send' })).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test('[P0] clicking Stop calls POST /:id/stop with Bearer JWT (AC-3)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'hello');

      await mocks.emit('RUN_STARTED');
      await expect(
        page.getByRole('button', { name: 'Stop agent' }),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Stop agent' }).click();

      await mocks.waitForFetchCount(3);

      const calls = await mocks.fetchCalls();
      const stopCall = calls.find(
        (c) => c.url.includes('/stop') && c.method === 'POST',
      );
      expect(stopCall).toBeDefined();
      expect(stopCall?.url).toContain(
        `/api/conversations/${CONVERSATION_ID}/stop`,
      );
      expect(stopCall?.headers.authorization).toMatch(/^Bearer .+/);
    } finally {
      await cleanup();
    }
  });

  test('[P0] after Stop, Send button reappears and user can send a new message (AC-3)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'first message');

      await mocks.emit('RUN_STARTED');
      await expect(
        page.getByRole('button', { name: 'Stop agent' }),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Stop agent' }).click();

      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();

      const input = page.getByRole('textbox', { name: 'Message input' });
      await input.fill('second message');
      await page.getByRole('button', { name: 'Send' }).click();

      await mocks.waitForFetchCount(4);

      const calls = await mocks.fetchCalls();
      const turnCalls = calls.filter(
        (c) => c.url.includes('/turns') && c.method === 'POST',
      );
      expect(turnCalls.length).toBeGreaterThanOrEqual(2);
    } finally {
      await cleanup();
    }
  });

  // ─── AC-4: Copy actions and timestamps ───

  test('[P0] copy button copies message content to clipboard (AC-4)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);

    const { cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'copy me please');

      const copyButton = page
        .getByRole('button', { name: 'Copy to clipboard' })
        .first();
      await copyButton.click();

      await expect(page.getByText('Copied')).toBeVisible();

      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(clipboardText).toContain('copy me please');
    } finally {
      await cleanup();
    }
  });

  test('[P0] timestamp is visible on hover over user message (AC-4)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'timestamp test');

      const userMessage = page
        .locator('.group', { hasText: 'timestamp test' })
        .first();
      await userMessage.hover();

      const timePattern = /\d{2}:\d{2}/;
      await expect(userMessage.getByText(timePattern)).toBeVisible();
    } finally {
      await cleanup();
    }
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

    const inputAfterReload = page.getByRole('textbox', {
      name: 'Message input',
    });
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

    const storedAfter = await mocks.getLocalStorage(
      `conversation-${CONVERSATION_ID}-draft`,
    );
    expect(storedAfter === null || storedAfter === '').toBeTruthy();
  });

  // ─── AC-5: Scroll-to-bottom during streaming (UX-DR9) ───

  test('[P2] auto-scroll follows streaming messages (UX-DR9)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      {
        conversationId: CONVERSATION_ID,
        turnTitle: TURN_TITLE,
        skills: MOCK_SKILLS,
      },
    );
    try {
      await sendMessage(page, 'tell me a long story');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });

      // Stream enough content to make the container overflow
      for (let i = 0; i < 30; i++) {
        await mocks.emit('TEXT_MESSAGE_CONTENT', {
          messageId: 'msg-1',
          delta: `Line ${i} of the story. `.repeat(3),
        });
      }

      // Verify auto-scroll kept the view at the bottom
      await page.waitForFunction(
        () => {
          const el = document.querySelector(
            '[data-testid="chat-message-list"]',
          ) as HTMLElement | null;
          if (!el) return false;
          return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        },
        { timeout: 5000 },
      );

      await mocks.emit('TEXT_MESSAGE_END');
      await mocks.emit('RUN_FINISHED');
    } finally {
      await cleanup();
    }
  });

  test('[P2] scrolling up during streaming pauses auto-scroll and shows scroll-to-bottom button with count (UX-DR9)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });

    // Stream enough content to make the container overflow (must exceed the
    // 50px threshold in handleScroll so scrolling to top is detected as
    // "not at bottom")
    await mocks.emit('TEXT_MESSAGE_CONTENT', {
      messageId: 'msg-1',
      delta: Array.from({ length: 60 }, (_, i) =>
        `Line ${i} of the story. `.repeat(5),
      ).join(''),
    });

    // Verify we're at the bottom first
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="chat-message-list"]',
        ) as HTMLElement | null;
        if (!el) return false;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      },
      { timeout: 5000 },
    );

    // Scroll up to pause auto-scroll
    await page.getByTestId('chat-message-list').evaluate((el) => {
      el.scrollTop = 0;
    });

    // Wait for the scroll-to-bottom button to appear (confirms isAtBottomRef is false)
    await expect(
      page.getByRole('button', { name: /scroll to bottom/i }),
    ).toBeVisible();

    // Start a new message (changes messages.length → increments newMessageCount)
    await mocks.emit('TEXT_MESSAGE_END');
    await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-2' });
    await mocks.emit('TEXT_MESSAGE_CONTENT', {
      messageId: 'msg-2',
      delta: 'New message after scroll up. '.repeat(10),
    });

    // Verify button now shows a new-message count badge
    await expect(page.getByText(/\d+ new messages/i)).toBeVisible();

    // Wait for the new message content to render before checking scroll position
    await expect(
      page.getByText('New message after scroll up', { exact: false }).first(),
    ).toBeVisible();

    // Verify scroll position did NOT jump to bottom
    const stillScrolledUp = await page
      .getByTestId('chat-message-list')
      .evaluate((el) => el.scrollTop < 50);
    expect(stillScrolledUp).toBe(true);

    await mocks.emit('TEXT_MESSAGE_END');
    await mocks.emit('RUN_FINISHED');
  });

  test('[P2] clicking scroll-to-bottom re-enables auto-scroll (UX-DR9)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });

    // Stream enough content to make the container overflow (must exceed the
    // 50px threshold in handleScroll so scrolling to top is detected as
    // "not at bottom")
    await mocks.emit('TEXT_MESSAGE_CONTENT', {
      messageId: 'msg-1',
      delta: Array.from({ length: 60 }, (_, i) =>
        `Line ${i} of the story. `.repeat(5),
      ).join(''),
    });

    // Scroll up to pause auto-scroll
    await page.getByTestId('chat-message-list').evaluate((el) => {
      el.scrollTop = 0;
    });

    // Wait for the scroll-to-bottom button to appear
    await expect(
      page.getByRole('button', { name: /scroll to bottom/i }),
    ).toBeVisible();

    // Emit a new message while scrolled up
    await mocks.emit('TEXT_MESSAGE_END');
    await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-2' });
    await mocks.emit('TEXT_MESSAGE_CONTENT', {
      messageId: 'msg-2',
      delta: 'New content after scroll up. '.repeat(10),
    });

    // Wait for the new content to render so scrollHeight is current
    await expect(
      page.getByText('New content after scroll up', { exact: false }).first(),
    ).toBeVisible();

    // Click scroll-to-bottom button
    await page.getByRole('button', { name: /scroll to bottom/i }).click();

    // Verify scroll position is at the bottom
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="chat-message-list"]',
        ) as HTMLElement | null;
        if (!el) return false;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      },
      { timeout: 5000 },
    );

    // Emit more content — auto-scroll should follow
    await mocks.emit('TEXT_MESSAGE_CONTENT', {
      messageId: 'msg-2',
      delta: 'More content after re-enable. '.repeat(10),
    });

    // Wait for the new content to render before verifying auto-scroll
    await expect(
      page.getByText('More content after re-enable', { exact: false }).first(),
    ).toBeVisible();

    // Verify auto-scroll is still following
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="chat-message-list"]',
        ) as HTMLElement | null;
        if (!el) return false;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      },
      { timeout: 5000 },
    );

    await mocks.emit('TEXT_MESSAGE_END');
    await mocks.emit('RUN_FINISHED');
  });
});
