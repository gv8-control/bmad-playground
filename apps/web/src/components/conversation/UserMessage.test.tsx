/**
 * @jest-environment jsdom
 *
 * Story 3.3: Converse with the Streaming Agent
 * Tests for UserMessage component.
 * Covers AC-4 (copy action, timestamp).
 */
import { render, screen } from '@testing-library/react';
import { UserMessage } from './UserMessage';
import type { ChatMessage } from './types';

const message: ChatMessage = {
  id: 'msg-1',
  role: 'user',
  content: 'Hello agent',
  createdAt: new Date('2026-07-04T12:00:00Z'),
};

describe('UserMessage', () => {
  it('[P0] renders content', () => {
    render(<UserMessage message={message} />);
    expect(screen.getByText('Hello agent')).toBeInTheDocument();
  });

  it('[P0] renders copy button', () => {
    render(<UserMessage message={message} />);
    expect(screen.getByLabelText('Copy to clipboard')).toBeInTheDocument();
  });

  it('[P0] renders timestamp from message createdAt', () => {
    render(<UserMessage message={message} />);
    expect(screen.getByText(/12:00/)).toBeInTheDocument();
  });
});
