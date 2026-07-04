/**
 * @jest-environment jsdom
 *
 * Story 3.4: See Tool Calls and Recognized Actions Inline
 * Unit tests for SemanticPill component.
 *
 * Covers: AC-2 (Semantic Pill for confirmed git commit — "Progress saved"
 *         + artifact type/title + View link).
 *
 * TDD RED PHASE — tests are skipped until implementation lands.
 * Remove it.skip() → it() when activating for the current task.
 */
import { render, screen } from '@testing-library/react';
import { SemanticPill } from './SemanticPill';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('SemanticPill', () => {
  const defaultProps = {
    artifactType: 'prd',
    artifactTitle: 'Product Requirements Document',
    viewHref: '/artifacts?id=art-1',
  };

  describe('[P0] AC-2 — Content rendering', () => {
    it.skip('renders "Progress saved" label', () => {
      render(<SemanticPill {...defaultProps} />);
      expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
    });

    it.skip('renders artifact type and title', () => {
      render(<SemanticPill {...defaultProps} />);
      expect(screen.getByText(/PRD/)).toBeInTheDocument();
      expect(screen.getByText(/Product Requirements Document/)).toBeInTheDocument();
    });

    it.skip('renders View link with correct href', () => {
      render(<SemanticPill {...defaultProps} />);
      const link = screen.getByRole('link', { name: /view/i });
      expect(link).toHaveAttribute('href', '/artifacts?id=art-1');
    });

    it.skip('link has positive color and underline styling', () => {
      render(<SemanticPill {...defaultProps} />);
      const link = screen.getByRole('link', { name: /view/i });
      expect(link.className).toContain('positive');
      expect(link.className).toContain('underline');
    });
  });

  describe('[P1] AC-2 — Accessibility', () => {
    it.skip('has role="status" for screen reader announcement', () => {
      render(<SemanticPill {...defaultProps} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });
});
