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

import { AgentMessage, markdownComponents } from './AgentMessage';
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

// ─── Story 5.3: Fix Conversation Stream Structural Drift ───────────────────
//
// GREEN PHASE: tests are active for Story 5.3 implementation.
//
// AC-5: Inter-message gap is 24px (mb-6), not 16px (mb-4)
// AC-7: Markdown links have focus ring

describe('AgentMessage — Story 5.3 structural drift', () => {
  describe('[P0] AC-5 — Inter-message gap is 24px', () => {
    it('agent message container uses mb-6 (24px gap), not mb-4 (16px)', () => {
      const { container } = render(<AgentMessage message={message} />);
      const messageWrapper = container.querySelector('.group');
      expect(messageWrapper?.className).toContain('mb-6');
      expect(messageWrapper?.className).not.toContain('mb-4');
    });
  });

  describe('[P0] AC-7 — Markdown links have focus ring', () => {
    it('markdown link component includes focus ring classes', () => {
      const { container } = render(
        <markdownComponents.a href="https://example.com">example</markdownComponents.a>,
      );
      const link = container.querySelector('a');
      expect(link).toBeInTheDocument();
      expect(link?.className).toContain('focus:ring-2');
      expect(link?.className).toContain('focus:ring-accent');
      expect(link?.className).toContain('focus:outline-none');
    });
  });
});
