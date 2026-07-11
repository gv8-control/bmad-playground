/**
 * @jest-environment jsdom
 *
 * Story 3.3: Converse with the Streaming Agent
 * Tests for ChatMessageList component.
 * Covers AC-1 (renders messages), AC-5 (scroll-to-bottom button).
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
