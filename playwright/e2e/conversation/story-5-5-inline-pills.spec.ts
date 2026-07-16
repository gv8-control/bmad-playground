import { type Page } from '@playwright/test';
import { test, expect } from '../../support/merged-fixtures';
import { setupReadySession, sendMessage } from '../../support/streaming-mocks';

/**
 * Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream
 *
 * E2E tests for the architectural change from flat `messages` array (tool calls
 * as separate entries) to a segments-based model (tool calls interleaved inline
 * within agent messages at their stream position).
 *
 * Covers:
 *   AC-1  — Tool call indicator renders inline at stream position (not standalone row)
 *   AC-2  — Tool call result replaces indicator in place (no layout shift)
 *   AC-3  — Semantic Pill promoted in place at same stream position
 *   AC-4  — Error-state Tool Pill renders inline (not standalone row)
 *   AC-5  — Access Notice renders inline below error Tool Pill
 *   AC-10 — AgentMessage renders interleaved pills at correct positions
 *
 * Note: AC-9 (resume restores tool pills) is covered by component-level tests
 * in ConversationPane.test.tsx and agent.service tests, not by E2E tests.
 *
 * Mock infrastructure uses the shared WM-2 helpers from streaming-mocks.ts:
 *   - addInitScript only (class-based EventSource mock + window.fetch override)
 *   - waitForFunction for waitForEventSource (30s timeout)
 *   - setupReadySession seeds the conversation in the DB and navigates to
 *     /conversations/{id}, avoiding the navigation race that occurs when
 *     sendMessage triggers router.push on an unseeded conversation.
 *   - Shared readySession and sendMessage helpers.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 * The `.group.mb-6.justify-start` class is used only to scope locators to the
 * agent message container (distinguishing from user messages which use a
 * different justify class).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

const CONVERSATION_ID = 'conv-e2e-story-5-5';
const TURN_TITLE = 'Story 5.5 Test';

/**
 * Returns the first agent message container locator.
 * Agent messages use `.group.mb-6.justify-start` (distinct from user messages
 * which use a different justify class).
 */
function agentMessageLocator(page: Page) {
  return page.locator('.group.mb-6.justify-start').first();
}

test.describe('Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream', () => {
  test.describe.configure({ mode: 'serial' });

  // ─── AC-1: Tool call indicator renders inline at stream position ───

  test('[P0] TOOL_CALL_START renders running indicator inline within agent message, not standalone row (AC-1, AC-10)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      { conversationId: CONVERSATION_ID, turnTitle: TURN_TITLE },
    );
    try {
      await sendMessage(page, 'run a tool');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Let me check the repository.' });
      await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'read_file' });

      const agentMessage = agentMessageLocator(page);

      // The running indicator is WITHIN the agent message container
      await expect(agentMessage.getByText('Running… read_file')).toBeVisible();

      // The text before the tool call is also within the same agent message
      await expect(agentMessage.getByText('Let me check the repository.')).toBeVisible();

      // There is exactly ONE agent message — the tool call did not create a
      // separate standalone message row
      const agentMessageCount = await page.locator('.group.mb-6.justify-start').count();
      expect(agentMessageCount).toBe(1);
    } finally {
      await cleanup();
    }
  });

  // ─── AC-2: Tool call result replaces indicator in place ───

  test('[P0] TOOL_CALL_RESULT replaces running indicator with completed pill in place within agent message (AC-2)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      { conversationId: CONVERSATION_ID, turnTitle: TURN_TITLE },
    );
    try {
      await sendMessage(page, 'run a tool');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Checking file.' });
      await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'read_file' });

      const agentMessage = agentMessageLocator(page);
      await expect(agentMessage.getByText('Running… read_file')).toBeVisible();

      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'file content here',
        role: 'tool',
      });

      // Running indicator is gone
      await expect(agentMessage.getByText('Running… read_file')).toHaveCount(0);

      // Completed pill is visible WITHIN the agent message (same container)
      await expect(agentMessage.getByRole('button', { name: /read_file completed/ })).toBeVisible();

      // Still only one agent message
      const agentMessageCount = await page.locator('.group.mb-6.justify-start').count();
      expect(agentMessageCount).toBe(1);
    } finally {
      await cleanup();
    }
  });

  // ─── AC-3: Semantic Pill promoted in place ───

  test('[P0] TOOL_CALL_PROMOTED replaces Tool Pill with Semantic Pill in place within agent message (AC-3)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      { conversationId: CONVERSATION_ID, turnTitle: TURN_TITLE },
    );
    try {
      await sendMessage(page, 'commit changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Saving progress.' });
      await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      await mocks.emit('TOOL_CALL_ARGS', { toolCallId: 'tc-1', delta: 'git commit -m "update PRD"' });
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

      const agentMessage = agentMessageLocator(page);

      // Semantic Pill is WITHIN the agent message container
      await expect(agentMessage.getByText('Progress saved')).toBeVisible();
      await expect(agentMessage.getByText('PRD')).toBeVisible();
      await expect(agentMessage.getByText('bmad-easy Product Requirements')).toBeVisible();

      // View link is within the agent message and has the correct href
      const viewLink = agentMessage.getByRole('link', { name: 'View' });
      await expect(viewLink).toBeVisible();
      await expect(viewLink).toHaveAttribute('href', '/artifacts?id=art-1');

      // Still only one agent message
      const agentMessageCount = await page.locator('.group.mb-6.justify-start').count();
      expect(agentMessageCount).toBe(1);
    } finally {
      await cleanup();
    }
  });

  // ─── AC-4: Error-state Tool Pill renders inline ───

  test('[P0] failed tool call renders error-state Tool Pill inline within agent message (AC-4)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      { conversationId: CONVERSATION_ID, turnTitle: TURN_TITLE },
    );
    try {
      await sendMessage(page, 'read a file');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Reading file.' });
      await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'read_file' });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'Error: file not found',
        role: 'tool',
      });

      const agentMessage = agentMessageLocator(page);

      // Error-state pill is WITHIN the agent message container
      await expect(agentMessage.getByRole('button', { name: /read_file failed/ })).toBeVisible();

      // Still only one agent message
      const agentMessageCount = await page.locator('.group.mb-6.justify-start').count();
      expect(agentMessageCount).toBe(1);
    } finally {
      await cleanup();
    }
  });

  // ─── AC-5: Access Notice renders inline below error Tool Pill ───

  test('[P0] ACCESS_DENIED renders Access Notice inline below error Tool Pill within agent message (AC-5)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      { conversationId: CONVERSATION_ID, turnTitle: TURN_TITLE },
    );
    try {
      await sendMessage(page, 'push changes');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Pushing to remote.' });
      await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      await mocks.emit('TOOL_CALL_ARGS', { toolCallId: 'tc-1', delta: 'git push origin main' });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'error: failed to push some refs to origin\nexit code 1',
        role: 'tool',
      });
      await mocks.emit('ACCESS_DENIED', {
        toolCallId: 'tc-1',
        code: 'INSUFFICIENT_PERMISSION',
      });

      const agentMessage = agentMessageLocator(page);

      // Error-state Tool Pill is within the agent message
      await expect(agentMessage.getByRole('button', { name: /Bash failed/ })).toBeVisible();

      // Access Notice is also within the same agent message (inline below the pill)
      await expect(
        agentMessage.getByText("Your account doesn't have access to this resource."),
      ).toBeVisible();

      // Still only one agent message
      const agentMessageCount = await page.locator('.group.mb-6.justify-start').count();
      expect(agentMessageCount).toBe(1);
    } finally {
      await cleanup();
    }
  });

  // ─── AC-1, AC-10: Multiple tool calls interleave with text ───

  test('[P0] multiple tool calls interleave with text segments within same agent message (AC-1, AC-10)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      { conversationId: CONVERSATION_ID, turnTitle: TURN_TITLE },
    );
    try {
      await sendMessage(page, 'run two tools with text between');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });

      // Text before first tool
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'First, I will read a file.' });

      // First tool call
      await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'read_file' });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'file A content',
        role: 'tool',
      });

      // Text between tools
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Now I will write a file.' });

      // Second tool call
      await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-2', toolCallName: 'write_file' });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-2' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-2',
        toolCallId: 'tc-2',
        content: 'written',
        role: 'tool',
      });

      // Text after second tool
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Done.' });
      await mocks.emit('TEXT_MESSAGE_END');

      const agentMessage = agentMessageLocator(page);

      // Both pills are within the agent message
      await expect(agentMessage.getByRole('button', { name: /read_file completed/ })).toBeVisible();
      await expect(agentMessage.getByRole('button', { name: /write_file completed/ })).toBeVisible();

      // All text segments are within the agent message
      await expect(agentMessage.getByText('First, I will read a file.')).toBeVisible();
      await expect(agentMessage.getByText('Now I will write a file.')).toBeVisible();
      await expect(agentMessage.getByText('Done.')).toBeVisible();

      // Exactly one agent message — no standalone tool-call rows
      const agentMessageCount = await page.locator('.group.mb-6.justify-start').count();
      expect(agentMessageCount).toBe(1);
    } finally {
      await cleanup();
    }
  });

  // ─── AC-2: No layout shift on expand/collapse ───

  test('[P1] expanding and collapsing a Tool Pill does not shift surrounding text (AC-2)', async ({
    page,
    request,
    withRepoConnection,
  }) => {
    const { mocks, cleanup } = await setupReadySession(
      page,
      request,
      withRepoConnection.userId,
      { conversationId: CONVERSATION_ID, turnTitle: TURN_TITLE },
    );
    try {
      await sendMessage(page, 'run a tool');

      await mocks.emit('RUN_STARTED');
      await mocks.emit('TEXT_MESSAGE_START', { messageId: 'msg-1' });
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Before tool.' });
      await mocks.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'read_file' });
      await mocks.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      await mocks.emit('TOOL_CALL_RESULT', {
        messageId: 'msg-tool-1',
        toolCallId: 'tc-1',
        content: 'file output',
        role: 'tool',
      });
      await mocks.emit('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'After tool.' });
      await mocks.emit('TEXT_MESSAGE_END');

      const agentMessage = agentMessageLocator(page);
      const pill = agentMessage.getByRole('button', { name: /read_file completed/ });

      // Expand the pill (force: true — the pill may be animating)
      await pill.click({ force: true });
      await expect(agentMessage.getByText('file output')).toBeVisible();

      // "After tool." text should still be visible (not pushed off-screen)
      const afterText = agentMessage.getByText('After tool.');
      await expect(afterText).toBeVisible();

      // Collapse the pill (force: true — the pill may be animating)
      await pill.click({ force: true });
      await expect(agentMessage.getByText('file output')).toHaveCount(0);

      // "After tool." text should still be visible
      await expect(afterText).toBeVisible();
    } finally {
      await cleanup();
    }
  });
});
