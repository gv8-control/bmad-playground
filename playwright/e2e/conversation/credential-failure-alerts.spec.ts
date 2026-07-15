import { test, expect, type Page } from '../../support/merged-fixtures';

/**
 * Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation
 *
 * E2E tests for the frontend handling of CREDENTIAL_FAILURE and
 * ACCESS_DENIED SSE events emitted mid-conversation by the
 * ToolPillClassifierService (401/403 detection on git tool call output).
 *
 * Covers:
 *   AC-3 — CREDENTIAL_FAILURE shows CredentialErrorBanner with re-auth
 *          prompt, without navigating away from the conversation
 *   AC-4 — ACCESS_DENIED renders error-state Tool Pill + dismissible
 *          AccessNotice below it, no banner, no input disable, no agent
 *          turn halt
 *
 * The browser calls agent-be directly (POST /api/conversations, SSE,
 * POST /:id/turns). Both `fetch` and `EventSource` are mocked from the
 * page so the tests exercise the real ConversationPane state machine
 * without a live Daytona provision or a real Claude agent. agent-be
 * still starts (via the playwright webServer block) so the page's
 * boundary-JWT mint path runs against the real AUTH_SECRET.
 *
 * Note: Story 3.7 originally deferred E2E tests (DP-5) on the assumption
 * that they require a real GitHub 401/403 (token revocation). The
 * existing MockEventSource pattern (established in Stories 3.3/3.4/3.6)
 * mocks the SSE channel at the browser level, so CREDENTIAL_FAILURE and
 * ACCESS_DENIED events can be emitted directly — no real GitHub calls.
 * The backend detection logic (AC-1, AC-2) is covered by unit tests in
 * tool-pill-classifier.service.spec.ts and agent.service.unit.spec.ts.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

// Stable per-file identifier — conversation IDs are scoped to the test user
// (which IS per-worker), so no cross-worker collision is possible.
const CONVERSATION_ID = 'conv-e2e-credential-alerts';
// 2 = POST /api/conversations (create) + GET /skills (initial load) — both
// fire after SESSION_READY, before the user sends a message. POST /:id/turns
// happens later (after sendMessage) and is not counted here.
const EXPECTED_INIT_FETCH_COUNT = 2;

const TURN_TITLE = 'Credential Alert Test';

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
  };
}

async function readySession(mocks: MockHandle): Promise<void> {
  await mocks.waitForEventSource();
  await mocks.emit('SESSION_READY', { sandboxId: 'sb-1' });
  await mocks.waitForFetchCount(EXPECTED_INIT_FETCH_COUNT);
}

async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await input.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test.describe('Story 3.7: Credential Failure Alerts Mid-Conversation', () => {
  // Tests are independent — each installs fresh MockEventSource + fetch overrides
  // via setupStreamingMocks(page) on a fresh page with per-test withRepoConnection.
  // Serial mode was removed to allow parallelization across workers.

  // ─── AC-3: CREDENTIAL_FAILURE — re-auth prompt without navigation away ───

  test('[P0] CREDENTIAL_FAILURE event shows CredentialErrorBanner (AC-3)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'remote: Invalid username or token',
      role: 'tool',
    });
    await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });

    await expect(page.getByText('Your repository connection needs attention.')).toBeVisible();
  });

  test('[P0] CREDENTIAL_FAILURE marks the failing tool pill as error state (AC-3)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'remote: Invalid username or token',
      role: 'tool',
    });
    await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });

    await expect(page.getByRole('button', { name: /Bash failed/ })).toBeVisible();
  });

  test('[P0] CredentialErrorBanner shows "Update access token" re-auth link (AC-3)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });

    await expect(page.getByText('Your repository connection needs attention.')).toBeVisible();

    // The re-auth prompt is the "Update access token" link inside the banner.
    // Clicking it opens a Radix UI Dialog with the re-auth flow. The dialog
    // opening is verified in unit tests (ConversationPane.test.tsx Task 15.1);
    // the E2E test verifies the link is present and clickable.
    const reauthLink = page.getByRole('link', { name: 'Update access token' });
    await expect(reauthLink).toBeVisible();
    await expect(reauthLink).toHaveAttribute('href', '#');
  });

  test('[P0] CREDENTIAL_FAILURE does not navigate away from the conversation (AC-3)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });

    await expect(page.getByText('Your repository connection needs attention.')).toBeVisible();

    // The user remains on the conversation page — no redirect to /sign-in or /onboarding
    await expect(page).toHaveURL(/\/conversations/);
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
  });

  test('[P1] CREDENTIAL_FAILURE for a non-existent toolCallId still shows the banner (AC-3)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'hello');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'non-existent-tc' });

    await expect(page.getByText('Your repository connection needs attention.')).toBeVisible();
  });

  // ─── AC-4: ACCESS_DENIED — error-state Tool Pill + Access Notice, no banner, no halt ───

  test('[P0] ACCESS_DENIED with RATE_LIMITED renders AccessNotice with rate-limit copy (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'Rate limit exceeded',
      role: 'tool',
    });
    await mocks.emit('ACCESS_DENIED', { toolCallId: 'tc-1', code: 'RATE_LIMITED' });

    await expect(
      page.getByText('GitHub is rate-limiting this request. Wait a moment and try again.'),
    ).toBeVisible();
  });

  test('[P0] ACCESS_DENIED with ORG_RESTRICTION renders org-restriction copy (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'Resource not accessible by integration',
      role: 'tool',
    });
    await mocks.emit('ACCESS_DENIED', { toolCallId: 'tc-1', code: 'ORG_RESTRICTION' });

    await expect(
      page.getByText("Your organization hasn't approved this app. Ask an org admin to grant access."),
    ).toBeVisible();
  });

  test('[P0] ACCESS_DENIED with INSUFFICIENT_PERMISSION renders insufficient-permission copy (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'Permission denied',
      role: 'tool',
    });
    await mocks.emit('ACCESS_DENIED', { toolCallId: 'tc-1', code: 'INSUFFICIENT_PERMISSION' });

    await expect(
      page.getByText("Your account doesn't have access to this resource."),
    ).toBeVisible();
  });

  test('[P0] ACCESS_DENIED renders AccessNotice below the error-state Tool Pill (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'Permission denied',
      role: 'tool',
    });
    await mocks.emit('ACCESS_DENIED', { toolCallId: 'tc-1', code: 'INSUFFICIENT_PERMISSION' });

    // The tool pill shows error state
    await expect(page.getByRole('button', { name: /Bash failed/ })).toBeVisible();

    // The AccessNotice renders below the pill (filter to distinguish from the
    // "Agent is thinking" indicator which also uses role="status")
    await expect(
      page.getByRole('status').filter({ hasText: "Your account" }),
    ).toBeVisible();
  });

  test('[P0] ACCESS_DENIED does NOT show CredentialErrorBanner (AC-4, FINDING-12)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'Rate limit exceeded',
      role: 'tool',
    });
    await mocks.emit('ACCESS_DENIED', { toolCallId: 'tc-1', code: 'RATE_LIMITED' });

    // The AccessNotice is visible
    await expect(
      page.getByText('GitHub is rate-limiting this request. Wait a moment and try again.'),
    ).toBeVisible();

    // The CredentialErrorBanner is NOT shown (403 is not a credential failure per FINDING-12)
    await expect(page.getByText('Your repository connection needs attention.')).toHaveCount(0);
  });

  test('[P0] ACCESS_DENIED does NOT disable the chat input (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'Rate limit exceeded',
      role: 'tool',
    });
    await mocks.emit('ACCESS_DENIED', { toolCallId: 'tc-1', code: 'RATE_LIMITED' });

    await expect(
      page.getByText('GitHub is rate-limiting this request. Wait a moment and try again.'),
    ).toBeVisible();

    // The chat input remains enabled — user can continue typing
    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeVisible();
    await expect(input).not.toBeDisabled();
  });

  test('[P0] ACCESS_DENIED with retryAfter renders retry hint in the notice (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'Rate limit exceeded',
      role: 'tool',
    });
    await mocks.emit('ACCESS_DENIED', { toolCallId: 'tc-1', code: 'RATE_LIMITED', retryAfter: 60 });

    await expect(
      page.getByText('GitHub is rate-limiting this request. Wait a moment and try again. (retry in ~60s)'),
    ).toBeVisible();
  });

  test('[P0] Dismiss button hides the AccessNotice (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'Rate limit exceeded',
      role: 'tool',
    });
    await mocks.emit('ACCESS_DENIED', { toolCallId: 'tc-1', code: 'RATE_LIMITED' });

    await expect(
      page.getByText('GitHub is rate-limiting this request. Wait a moment and try again.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss notice' }).click();

    await expect(
      page.getByText('GitHub is rate-limiting this request. Wait a moment and try again.'),
    ).toHaveCount(0);
  });

  test('[P1] ACCESS_DENIED does NOT halt the agent turn — Send button remains available (AC-4)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupStreamingMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    await sendMessage(page, 'push my changes');

    await mocks.emit('RUN_STARTED');
    await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
    await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
    await mocks.emit('TOOL_CALL_RESULT', {
      messageId: 'msg-tool-1',
      toolCallId: 'tc-1',
      content: 'Rate limit exceeded',
      role: 'tool',
    });
    await mocks.emit('ACCESS_DENIED', { toolCallId: 'tc-1', code: 'RATE_LIMITED' });

    await expect(
      page.getByText('GitHub is rate-limiting this request. Wait a moment and try again.'),
    ).toBeVisible();

    // The agent turn is not halted — RUN_FINISHED transitions back to idle (Send visible)
    await mocks.emit('RUN_FINISHED');

    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });
});
