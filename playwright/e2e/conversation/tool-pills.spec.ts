import { test, expect } from '../../support/merged-fixtures';
import { setupReadySession, sendMessage } from '../../support/streaming-mocks';

/**
 * Story 3.4: See Tool Calls and Recognized Actions Inline
 *
 * E2E tests for the full Tool Pill lifecycle, Semantic Pill promotion,
 * error-state Tool Pills, and system messages (circuit breaker / stream
 * error).
 *
 * Covers:
 *   AC-1 — Tool Pill with in-place label replacement (running → completed,
 *          expand/collapse)
 *   AC-2 — Semantic Pill for confirmed git commit
 *   AC-3 — Error-state Tool Pill on failed git commit
 *   AC-4 — Error-state Tool Pill on any failed tool call
 *   AC-5 — Circuit breaker / stream error system messages
 *
 * The browser calls agent-be directly (POST /api/conversations, SSE,
 * POST /:id/turns). Both `fetch` and `EventSource` are mocked from the
 * page so the tests exercise the real ConversationPane state machine
 * without a live Daytona provision or a real Claude agent. agent-be
 * still starts (via the playwright webServer block) so the page's
 * boundary-JWT mint path runs against the real AUTH_SECRET.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

const CONVERSATION_ID = 'conv-e2e-tool-pills';
const TURN_TITLE = 'Tool Pill Test';

test.describe('Story 3.4: Tool Pills and Recognized Actions', () => {
  test.describe.configure({ mode: 'serial' });

  // ─── AC-1: Tool Pill with in-place label replacement ───

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

  test('[P0] TOOL_CALL_END replaces running label with completed Tool Pill (AC-1)', async ({
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
      await sendMessage(page, 'run a tool');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'read_file',
      });
      await expect(page.getByText('Running… read_file')).toBeVisible();

      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });

      await expect(page.getByText('Running… read_file')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /read_file completed/ }),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] clicking Tool Pill expands to show raw input and output (AC-1)', async ({
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
      await sendMessage(page, 'run a tool');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'read_file',
      });
      await mocks.emit('TOOL_CALL_ARGS', {
        toolCallId: 'tc-1',
        delta: '{"path":"README.md"}',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: '# README\nfile content here',
        role: 'tool',
      });

      const pill = page.getByRole('button', { name: /read_file completed/ });
      await pill.click();

      await expect(page.getByText('{"path":"README.md"}')).toBeVisible();
      await expect(page.getByText('# README')).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] clicking completed Tool Pill again collapses it (AC-1)', async ({
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
      await sendMessage(page, 'run a tool');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'read_file',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'file output',
        role: 'tool',
      });

      const pill = page.getByRole('button', { name: /read_file completed/ });
      await pill.click();
      await expect(page.getByText('file output')).toBeVisible();

      await pill.click();
      await expect(page.getByText('file output')).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test('[P0] TOOL_CALL_ARGS progressively accumulates tool input (AC-1)', async ({
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
      await sendMessage(page, 'run a tool');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'write_file',
      });
      await mocks.emit('TOOL_CALL_ARGS', {
        toolCallId: 'tc-1',
        delta: '{"path":"',
      });
      await mocks.emit('TOOL_CALL_ARGS', {
        toolCallId: 'tc-1',
        delta: 'README.md"}',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'written',
        role: 'tool',
      });

      const pill = page.getByRole('button', { name: /write_file completed/ });
      await pill.click();

      await expect(page.getByText('{"path":"README.md"}')).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  // ─── AC-2: Semantic Pill for confirmed git commit ───

  test('[P0] TOOL_CALL_PROMOTED replaces Tool Pill with Semantic Pill (AC-2)', async ({
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
      await sendMessage(page, 'commit changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_ARGS', {
        toolCallId: 'tc-1',
        delta: 'git commit -m "update PRD"',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content:
          '[main abc1234] update PRD\n 1 file changed\n create mode 100644 _bmad-output/planning-artifacts/prds/prd.md',
        role: 'tool',
      });
      await mocks.emit('TOOL_CALL_PROMOTED', {
        toolCallId: 'tc-1',
        artifactType: 'prd',
        artifactTitle: 'bmad-easy Product Requirements',
        artifactId: 'art-1',
        viewHref: '/artifacts?id=art-1',
      });

      await expect(page.getByText('Progress saved')).toBeVisible();
      await expect(page.getByText('PRD')).toBeVisible();
      await expect(
        page.getByText('bmad-easy Product Requirements'),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] Semantic Pill View link navigates to Artifact Browser (AC-2)', async ({
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
      await sendMessage(page, 'commit changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: '[main abc1234] update PRD\n 1 file changed',
        role: 'tool',
      });
      await mocks.emit('TOOL_CALL_PROMOTED', {
        toolCallId: 'tc-1',
        artifactType: 'prd',
        artifactTitle: 'bmad-easy Product Requirements',
        artifactId: 'art-1',
        viewHref: '/artifacts?id=art-1',
      });

      const viewLink = page.getByRole('link', { name: 'View' });
      await expect(viewLink).toBeVisible();
      await expect(viewLink).toHaveAttribute('href', '/artifacts?id=art-1');
    } finally {
      await cleanup();
    }
  });

  test('[P0] multiple commits each produce a distinct Semantic Pill at their positions (AC-2)', async ({
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
      await sendMessage(page, 'commit twice');

      await mocks.emit('RUN_STARTED');

      // First commit
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: '[main abc1234] first commit\n 1 file changed',
        role: 'tool',
      });
      await mocks.emit('TOOL_CALL_PROMOTED', {
        toolCallId: 'tc-1',
        artifactType: 'prd',
        artifactTitle: 'First PRD',
        artifactId: 'art-1',
        viewHref: '/artifacts?id=art-1',
      });

      // Second commit
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-2',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-2' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-2',
        toolCallId: 'tc-2',
        content: '[main def5678] second commit\n 1 file changed',
        role: 'tool',
      });
      await mocks.emit('TOOL_CALL_PROMOTED', {
        toolCallId: 'tc-2',
        artifactType: 'architecture',
        artifactTitle: 'Second Architecture',
        artifactId: 'art-2',
        viewHref: '/artifacts?id=art-2',
      });

      await expect(page.getByText('Progress saved')).toHaveCount(2);
      await expect(page.getByText('First PRD')).toBeVisible();
      await expect(page.getByText('Second Architecture')).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  // ─── AC-3 / AC-4: Error-state Tool Pill on failed tool call ───

  test('[P0] failed git commit shows error-state Tool Pill, not Semantic Pill (AC-3)', async ({
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
      await sendMessage(page, 'commit changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'Bash',
      });
      await mocks.emit('TOOL_CALL_ARGS', {
        toolCallId: 'tc-1',
        delta: 'git commit -m "fail"',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'error: failed to push some refs to origin\nexit code 1',
        role: 'tool',
      });

      await expect(page.getByText('Progress saved')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /Bash failed/ }),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] failed non-commit tool call shows error-state Tool Pill (AC-4)', async ({
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
      await sendMessage(page, 'read a file');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'read_file',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Error: file not found',
        role: 'tool',
      });

      await expect(
        page.getByRole('button', { name: /read_file failed/ }),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] error-state Tool Pill shows error message in expanded view (AC-4)', async ({
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
      await sendMessage(page, 'run a tool');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'read_file',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Error: permission denied',
        role: 'tool',
      });

      const pill = page.getByRole('button', { name: /read_file failed/ });
      await pill.click();

      await expect(
        page.getByText('Error: permission denied').first(),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  // ─── AC-5: System messages on circuit breaker / stream error ───

  test('[P0] RUN_ERROR renders system message, not an agent message (AC-5)', async ({
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
      await mocks.emit('RUN_ERROR', {
        message:
          'The agent stopped unexpectedly. Send a new message to try again.',
      });

      await expect(
        page.getByText(
          'The agent stopped unexpectedly. Send a new message to try again.',
        ),
      ).toBeVisible();

      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test('[P0] STREAM_ERROR renders system message, not an agent message (AC-5)', async ({
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
      await mocks.emit('STREAM_ERROR', { code: 'STREAM_BACK_PRESSURE' });

      await expect(
        page.getByText('Connection was slow and dropped. Please try again.'),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  // ─── Multiple tool calls at their positions ───

  test('[P1] multiple tool calls each render at their stream positions (AC-1)', async ({
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
      await sendMessage(page, 'run two tools');

      await mocks.emit('RUN_STARTED');

      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-1',
        toolCallName: 'read_file',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'file A content',
        role: 'tool',
      });

      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
      await mocks.emit('TEXT_MESSAGE_CONTENT', {
        messageId: 'msg-1',
        delta: 'Between tools.',
      });
      await mocks.emit('TEXT_MESSAGE_END');

      await mocks.emit('TOOL_CALL_START', {
        toolCallId: 'tc-2',
        toolCallName: 'write_file',
      });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-2' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-2',
        toolCallId: 'tc-2',
        content: 'written',
        role: 'tool',
      });

      await expect(
        page.getByRole('button', { name: /read_file completed/ }),
      ).toBeVisible();
      await expect(page.getByText('Between tools.')).toBeVisible();
      await expect(
        page.getByRole('button', { name: /write_file completed/ }),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });
});
