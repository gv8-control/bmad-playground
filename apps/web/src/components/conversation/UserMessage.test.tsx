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

  describe('[P3] AC-5 — timestamp hover-only behavior (UX-DR4)', () => {
    it('timestamp container has opacity-0 class (hover-only per DESIGN.md)', () => {
      const { container } = render(<UserMessage message={message} />);
      const timestamp = screen.getByText(/12:00/);
      const hoverWrapper = timestamp.parentElement;
      expect(hoverWrapper?.className).toContain('opacity-0');
      expect(hoverWrapper?.className).toContain('group-hover:opacity-100');
    });
  });
});

// ─── Story 5.3: Fix Conversation Stream Structural Drift ───────────────────
//
// GREEN PHASE: tests are active for Story 5.3 implementation.
//
// AC-5: Inter-message gap is 24px (mb-6), not 16px (mb-4)
// AC-5: User bubble padding is py-3 (12px), not py-2 (8px)

describe('UserMessage — Story 5.3 structural drift', () => {
  describe('[P0] AC-5 — Inter-message gap is 24px', () => {
    it('user message container uses mb-6 (24px gap), not mb-4 (16px)', () => {
      const { container } = render(<UserMessage message={message} />);
      const messageWrapper = container.querySelector('.group');
      expect(messageWrapper?.className).toContain('mb-6');
      expect(messageWrapper?.className).not.toContain('mb-4');
    });
  });

  describe('[P0] AC-5 — User bubble padding is py-3', () => {
    it('user bubble uses py-3 (12px padding), not py-2 (8px)', () => {
      const { container } = render(<UserMessage message={message} />);
      const bubble = container.querySelector('.rounded-lg.bg-surface-raised');
      expect(bubble?.className).toContain('py-3');
      expect(bubble?.className).not.toContain('py-2');
    });
  });
});
