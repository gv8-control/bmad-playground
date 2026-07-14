/**
 * @jest-environment jsdom
 *
 * Story 3.3: Converse with the Streaming Agent
 * Tests for ChatMessageList component.
 * Covers AC-1 (renders messages), AC-5 (scroll-to-bottom button).
 * Story 5.4 covers: AC-7 (scrollbar hiding via no-scrollbar on message panel).
 * Story 5.5 covers: AC-1, AC-2, AC-3, AC-4, AC-5 (inline pills — standalone
 * tool-call rendering branch removed, AgentMessage delegates all assistant
 * rendering including interleaved tool calls).
 * TDD GREEN PHASE — all tests un-skipped and passing.
 */
import { render, screen } from '@testing-library/react';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => null,
}));

import { ChatMessageList } from './ChatMessageList';
import type { ChatMessage } from './types';

const userMessage: ChatMessage = {
  id: 'msg-1',
  role: 'user',
  content: 'Hello agent',
  createdAt: new Date('2026-07-04T12:00:00Z'),
};

const agentMessage: ChatMessage = {
  id: 'msg-2',
  role: 'assistant',
  content: 'Hello user',
  createdAt: new Date('2026-07-04T12:00:01Z'),
};

describe('ChatMessageList', () => {
  it('[P0] renders messages', () => {
    render(
      <ChatMessageList
        messages={[userMessage, agentMessage]}
        showScrollToBottom={false}
        newMessageCount={0}
        onScrollToBottom={jest.fn()}
      />,
    );

    expect(screen.getByText('Hello agent')).toBeInTheDocument();
    expect(screen.getByText('Hello user')).toBeInTheDocument();
  });

  it('[P0] shows placeholder when no messages', () => {
    render(
      <ChatMessageList
        messages={[]}
        showScrollToBottom={false}
        newMessageCount={0}
        onScrollToBottom={jest.fn()}
      />,
    );

    expect(screen.getByText(/Press.*to browse available skills/)).toBeInTheDocument();
  });

  it('[P0] shows scroll-to-bottom button when showScrollToBottom is true', () => {
    render(
      <ChatMessageList
        messages={[userMessage]}
        showScrollToBottom={true}
        newMessageCount={3}
        onScrollToBottom={jest.fn()}
      />,
    );

    expect(screen.getByText('3 new messages')).toBeInTheDocument();
  });

  it('[P0] renders system message with role=status', () => {
    const systemMessage: ChatMessage = {
      id: 'sys-1',
      role: 'system',
      content: 'The agent stopped unexpectedly.',
      createdAt: new Date('2026-07-04T12:00:00Z'),
    };

    render(
      <ChatMessageList
        messages={[systemMessage]}
        showScrollToBottom={false}
        newMessageCount={0}
        onScrollToBottom={jest.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('The agent stopped unexpectedly.');
  });
});

// ─── Story 5.3: Fix Conversation Stream Structural Drift ───────────────────
//
// GREEN PHASE: tests are active for Story 5.3 implementation.
//
// AC-1: 824px column centering for messages
// AC-2: Rich new-conversation empty-state
// AC-7: role="log" on chat-messages container

describe('ChatMessageList — Story 5.3 structural drift', () => {
  describe('[P0] AC-1 — 824px column centering', () => {
    it('messages container has max-w-[824px] mx-auto w-full for column centering', () => {
      render(
        <ChatMessageList
          messages={[userMessage]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      const list = screen.getByTestId('chat-message-list');
      expect(list.className).toContain('max-w-[824px]');
      expect(list.className).toContain('mx-auto');
      expect(list.className).toContain('w-full');
    });
  });

  describe('[P0] AC-2 — Rich new-conversation empty-state', () => {
    it('renders ✦ icon character in empty state', () => {
      render(
        <ChatMessageList
          messages={[]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      expect(screen.getByText('✦')).toBeInTheDocument();
    });

    it('renders "Start a new conversation" title in empty state', () => {
      render(
        <ChatMessageList
          messages={[]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      expect(screen.getByText('Start a new conversation')).toBeInTheDocument();
    });

    it('renders <kbd> element showing "/" in empty state', () => {
      render(
        <ChatMessageList
          messages={[]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      const kbd = screen.getByText('/');
      expect(kbd.tagName).toBe('KBD');
    });

    it('does not render the old simplified placeholder text', () => {
      render(
        <ChatMessageList
          messages={[]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      expect(screen.queryByText(/Press `\/` to browse available skills/)).not.toBeInTheDocument();
    });
  });

  describe('[P0] AC-7 — role="log" on chat-messages container', () => {
    it('chat-messages container has role="log"', () => {
      render(
        <ChatMessageList
          messages={[userMessage]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      const list = screen.getByTestId('chat-message-list');
      expect(list).toHaveAttribute('role', 'log');
      expect(list).toHaveAttribute('aria-live', 'polite');
    });
  });

  // ─── Story 5.4: Scrollbar hiding (AC-7) ────────────────────────────────────
  //
  // Story 5.4: AC-7: Scrollable message panel hides scrollbars via no-scrollbar.
  // Test is active (GREEN) after Story 5.4 implementation.

  describe('[P0] Story 5.4, AC-7 — Scrollbar hiding on message panel', () => {
    it('message scroll panel has no-scrollbar class (AC-7)', () => {
      render(
        <ChatMessageList
          messages={[userMessage]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      const list = screen.getByTestId('chat-message-list');
      expect(list.className).toContain('no-scrollbar');
    });
  });
});

// ─── Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream ──
//
// GREEN PHASE: tests are active and passing.
//
// AC-1: No standalone tool-call rendering — pills render inline within AgentMessage

describe('ChatMessageList — Story 5.5 inline pills', () => {
  describe('[P0] AC-1 — No standalone tool-call rendering', () => {
    it('[P0] assistant message with segments renders pills inline (not standalone rows)', () => {
      const messageWithSegments: ChatMessage = {
        id: 'msg-seg-1',
        role: 'assistant',
        content: 'Before tool.\nAfter tool.',
        createdAt: new Date('2026-07-13T12:00:00Z'),
        segments: [
          { type: 'text', content: 'Before tool.\n' },
          {
            type: 'tool_call',
            toolCall: {
              toolCallId: 'tc-1',
              toolName: 'Bash',
              status: 'completed',
              input: 'git status',
              output: 'nothing to commit',
            },
          },
          { type: 'text', content: 'After tool.' },
        ],
      };

      render(
        <ChatMessageList
          messages={[messageWithSegments]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      expect(screen.getByText(/Bash/)).toBeInTheDocument();

      const agentMessageContainers = document.querySelectorAll('.group.mb-6');
      expect(agentMessageContainers.length).toBe(1);
      expect(agentMessageContainers[0].textContent).toContain('Before tool.');
      expect(agentMessageContainers[0].textContent).toContain('Bash');
      expect(agentMessageContainers[0].textContent).toContain('After tool.');
    });

    it('[P0] does not render standalone ToolPill branch for messages with segments', () => {
      const messageWithSegments: ChatMessage = {
        id: 'msg-seg-2',
        role: 'assistant',
        content: 'Done.',
        createdAt: new Date('2026-07-13T12:00:00Z'),
        segments: [
          { type: 'text', content: 'Done.' },
          {
            type: 'tool_call',
            toolCall: {
              toolCallId: 'tc-1',
              toolName: 'Bash',
              status: 'completed',
              input: 'git commit',
              output: '1 file changed',
              semantic: {
                artifactType: 'prd',
                artifactTitle: 'My PRD',
                viewHref: '/artifacts?id=art-1',
              },
            },
          },
        ],
      };

      render(
        <ChatMessageList
          messages={[messageWithSegments]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      expect(screen.getByText(/Progress saved/)).toBeInTheDocument();

      const agentMessageContainers = document.querySelectorAll('.group.mb-6');
      expect(agentMessageContainers.length).toBe(1);
    });

    it('[P0] legacy assistant message without segments still renders via AgentMessage', () => {
      const legacyMessage: ChatMessage = {
        id: 'msg-legacy',
        role: 'assistant',
        content: 'Hello user',
        createdAt: new Date('2026-07-13T12:00:00Z'),
      };

      render(
        <ChatMessageList
          messages={[legacyMessage]}
          showScrollToBottom={false}
          newMessageCount={0}
          onScrollToBottom={jest.fn()}
        />,
      );

      expect(screen.getByText('Hello user')).toBeInTheDocument();
    });
  });
});
