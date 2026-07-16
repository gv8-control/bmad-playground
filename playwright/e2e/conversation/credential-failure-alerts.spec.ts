import { test, expect } from '../../support/merged-fixtures';
import { setupReadySession, sendMessage } from '../../support/streaming-mocks';

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
const TURN_TITLE = 'Credential Alert Test';

test.describe('Story 3.7: Credential Failure Alerts Mid-Conversation', () => {
  // Tests are independent — each installs fresh MockEventSource + fetch overrides
  // via setupStreamingMocks(page) on a fresh page with per-test withRepoConnection.
  // Serial mode was removed to allow parallelization across workers.

  // ─── AC-3: CREDENTIAL_FAILURE — re-auth prompt without navigation away ───

  test('[P0] CREDENTIAL_FAILURE event shows CredentialErrorBanner (AC-3)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'remote: Invalid username or token',
        role: 'tool',
      });
      await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });

      await expect(
        page.getByText('Your repository connection needs attention.'),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] CREDENTIAL_FAILURE marks the failing tool pill as error state (AC-3)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'remote: Invalid username or token',
        role: 'tool',
      });
      await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });

      await expect(
        page.getByRole('button', { name: /Bash failed/ }),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] CredentialErrorBanner shows "Update access token" re-auth link (AC-3)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });

      await expect(
        page.getByText('Your repository connection needs attention.'),
      ).toBeVisible();

      // The re-auth prompt is the "Update access token" link inside the banner.
      // Clicking it opens a Radix UI Dialog with the re-auth flow. The dialog
      // opening is verified in unit tests (ConversationPane.test.tsx Task 15.1);
      // the E2E test verifies the link is present and clickable.
      const reauthLink = page.getByRole('link', {
        name: 'Update access token',
      });
      await expect(reauthLink).toBeVisible();
      await expect(reauthLink).toHaveAttribute('href', '#');
    } finally {
      await cleanup();
    }
  });

  test('[P0] CREDENTIAL_FAILURE does not navigate away from the conversation (AC-3)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });

      await expect(
        page.getByText('Your repository connection needs attention.'),
      ).toBeVisible();

      // The user remains on the conversation page — no redirect to /sign-in or /onboarding
      await expect(page).toHaveURL(/\/conversations/);
      await expect(
        page.getByRole('textbox', { name: 'Message input' }),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P1] CREDENTIAL_FAILURE for a non-existent toolCallId still shows the banner (AC-3)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'hello');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('CREDENTIAL_FAILURE', { toolCallId: 'non-existent-tc' });

      await expect(
        page.getByText('Your repository connection needs attention.'),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  // ─── AC-4: ACCESS_DENIED — error-state Tool Pill + Access Notice, no banner, no halt ───

  test('[P0] ACCESS_DENIED with RATE_LIMITED renders AccessNotice with rate-limit copy (AC-4)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Rate limit exceeded',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'RATE_LIMITED',
      });

      await expect(
        page.getByText(
          'GitHub is rate-limiting this request. Wait a moment and try again.',
        ),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] ACCESS_DENIED with ORG_RESTRICTION renders org-restriction copy (AC-4)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Resource not accessible by integration',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'ORG_RESTRICTION',
      });

      await expect(
        page.getByText(
          "Your organization hasn't approved this app. Ask an org admin to grant access.",
        ),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] ACCESS_DENIED with INSUFFICIENT_PERMISSION renders insufficient-permission copy (AC-4)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Permission denied',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'INSUFFICIENT_PERMISSION',
      });

      await expect(
        page.getByText("Your account doesn't have access to this resource."),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] ACCESS_DENIED renders AccessNotice below the error-state Tool Pill (AC-4)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Permission denied',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'INSUFFICIENT_PERMISSION',
      });

      // The tool pill shows error state
      await expect(
        page.getByRole('button', { name: /Bash failed/ }),
      ).toBeVisible();

      // The AccessNotice renders below the pill (filter to distinguish from the
      // "Agent is thinking" indicator which also uses role="status")
      await expect(
        page.getByRole('status').filter({ hasText: 'Your account' }),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] ACCESS_DENIED does NOT show CredentialErrorBanner (AC-4, FINDING-12)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Rate limit exceeded',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'RATE_LIMITED',
      });

      // The AccessNotice is visible
      await expect(
        page.getByText(
          'GitHub is rate-limiting this request. Wait a moment and try again.',
        ),
      ).toBeVisible();

      // The CredentialErrorBanner is NOT shown (403 is not a credential failure per FINDING-12)
      await expect(
        page.getByText('Your repository connection needs attention.'),
      ).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test('[P0] ACCESS_DENIED does NOT disable the chat input (AC-4)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Rate limit exceeded',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'RATE_LIMITED',
      });

      await expect(
        page.getByText(
          'GitHub is rate-limiting this request. Wait a moment and try again.',
        ),
      ).toBeVisible();

      // The chat input remains enabled — user can continue typing
      const input = page.getByRole('textbox', { name: 'Message input' });
      await expect(input).toBeVisible();
      await expect(input).not.toBeDisabled();
    } finally {
      await cleanup();
    }
  });

  test('[P0] ACCESS_DENIED with retryAfter renders retry hint in the notice (AC-4)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Rate limit exceeded',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'RATE_LIMITED',
        retryAfter: 60,
      });

      await expect(
        page.getByText(
          'GitHub is rate-limiting this request. Wait a moment and try again. (retry in ~60s)',
        ),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] Dismiss button hides the AccessNotice (AC-4)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Rate limit exceeded',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'RATE_LIMITED',
      });

      await expect(
        page.getByText(
          'GitHub is rate-limiting this request. Wait a moment and try again.',
        ),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Dismiss notice' }).click();

      await expect(
        page.getByText(
          'GitHub is rate-limiting this request. Wait a moment and try again.',
        ),
      ).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test('[P1] ACCESS_DENIED does NOT halt the agent turn — Send button remains available (AC-4)', async ({
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
      },
    );
    try {
      await sendMessage(page, 'push my changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Rate limit exceeded',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'RATE_LIMITED',
      });

      await expect(
        page.getByText(
          'GitHub is rate-limiting this request. Wait a moment and try again.',
        ),
      ).toBeVisible();

      // The agent turn is not halted — RUN_FINISHED transitions back to idle (Send visible)
      await mocks.emit('RUN_FINISHED');

      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    } finally {
      await cleanup();
    }
  });
});
