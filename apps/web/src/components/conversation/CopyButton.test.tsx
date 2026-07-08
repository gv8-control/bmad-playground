/**
 * @jest-environment jsdom
 *
 * Story 3.3-AC5: Copy actions + timestamps (UX-DR4)
 * P3 cosmetic/copy edge-case coverage.
 *
 * Tests CopyButton "Copied" feedback + revert (DESIGN.md: "After activation:
 * icon replaced with a 'Copied' label for 1.5 seconds, then reverts") and
 * alwaysVisible prop (code-block copy is always visible, not hover-only).
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CopyButton } from './CopyButton';

describe('CopyButton', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('[P3] AC-5 — "Copied" feedback and revert', () => {
    it('shows "Copied" label after click', async () => {
      render(<CopyButton text="hello" />);
      fireEvent.click(screen.getByLabelText('Copy to clipboard'));
      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument();
      });
    });

    it('aria-label changes to "Copied" after click', async () => {
      render(<CopyButton text="hello" />);
      fireEvent.click(screen.getByLabelText('Copy to clipboard'));
      await waitFor(() => {
        expect(screen.getByLabelText('Copied')).toBeInTheDocument();
      });
    });

    it('reverts to clipboard icon after 1.5 seconds', async () => {
      render(<CopyButton text="hello" />);
      fireEvent.click(screen.getByLabelText('Copy to clipboard'));
      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument();
      });

      act(() => {
        jest.advanceTimersByTime(1500);
      });

      expect(screen.queryByText('Copied')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Copy to clipboard')).toBeInTheDocument();
    });
  });

  describe('[P3] AC-5 — alwaysVisible prop (code-block copy)', () => {
    it('alwaysVisible=true does not apply opacity-0 class', () => {
      const { container } = render(<CopyButton text="hello" alwaysVisible />);
      const button = container.querySelector('button');
      expect(button?.className).not.toContain('opacity-0');
    });

    it('alwaysVisible=false (default) applies opacity-0 class for hover-only behavior', () => {
      const { container } = render(<CopyButton text="hello" />);
      const button = container.querySelector('button');
      expect(button?.className).toContain('opacity-0');
    });
  });
});
