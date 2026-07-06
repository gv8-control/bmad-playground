/**
 * @jest-environment jsdom
 *
 * Story 3.3: Converse with the Streaming Agent
 * Tests for AgentMessage component.
 * Covers AC-1 (streaming cursor), AC-4 (copy action, timestamp).
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

import { AgentMessage } from './AgentMessage';
import type { ChatMessage } from './types';

const message: ChatMessage = {
  id: 'msg-1',
  role: 'assistant',
  content: 'Hello **world**',
  createdAt: new Date('2026-07-04T12:00:00Z'),
};

describe('AgentMessage', () => {
  it('[P0] renders markdown content', () => {
    render(<AgentMessage message={message} />);
    expect(screen.getByTestId('markdown')).toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent('Hello **world**');
  });

  it('[P0] renders copy button', () => {
    render(<AgentMessage message={message} />);
    expect(screen.getByLabelText('Copy to clipboard')).toBeInTheDocument();
  });

  it('[P0] shows streaming cursor when isStreaming is true', () => {
    const streamingMessage = { ...message, isStreaming: true };
    const { container } = render(<AgentMessage message={streamingMessage} />);
    const cursor = container.querySelector('.animate-pulse.bg-accent');
    expect(cursor).toBeInTheDocument();
  });

  it('[P0] renders timestamp from message createdAt', () => {
    render(<AgentMessage message={message} />);
    expect(screen.getByText(/12:00/)).toBeInTheDocument();
  });
});
