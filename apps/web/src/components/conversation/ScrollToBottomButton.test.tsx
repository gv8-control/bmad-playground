/**
 * @jest-environment jsdom
 *
 * Story 5.3: Fix Conversation Stream Structural Drift
 * Tests for ScrollToBottomButton component.
 *
 * AC-5: Scroll-to-bottom button text color is text-text-2, not text-text-1
 */
import { render, screen } from '@testing-library/react';
import { ScrollToBottomButton } from './ScrollToBottomButton';

describe('ScrollToBottomButton — Story 5.3 structural drift', () => {
  describe('[P0] AC-5 — Text color is text-text-2', () => {
    it('button uses text-text-2 (secondary text), not text-text-1 (primary text)', () => {
      render(<ScrollToBottomButton count={0} onClick={jest.fn()} />);
      const button = screen.getByRole('button', { name: /scroll to bottom/i });
      expect(button.className).toContain('text-text-2');
      expect(button.className).not.toContain('text-text-1');
    });

    it('button with new messages count uses text-text-2', () => {
      render(<ScrollToBottomButton count={3} onClick={jest.fn()} />);
      const button = screen.getByText('3 new messages').closest('button')!;
      expect(button.className).toContain('text-text-2');
      expect(button.className).not.toContain('text-text-1');
    });
  });
});
