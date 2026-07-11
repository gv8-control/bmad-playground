/**
 * @jest-environment jsdom
 *
 * Story 3.4: See Tool Calls and Recognized Actions Inline
 * Story 3.6: Track and Manually Save Working Tree State
 * Unit tests for SemanticPill component.
 *
 * Covers: AC-2 (Semantic Pill for confirmed git commit — "Progress saved"
 *         + artifact type/title + View link).
 * Story 3.6 covers: AC-4 (manual save variant — "Progress saved" without
 *         artifact type/title/View link).
 */
import { render, screen } from '@testing-library/react';
import { SemanticPill } from './SemanticPill';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

describe('SemanticPill', () => {
  const defaultProps = {
    artifactType: 'prd',
    artifactTitle: 'Product Requirements Document',
    viewHref: '/artifacts?id=art-1',
  };

  describe('[P0] AC-2 — Content rendering', () => {
    it('renders "Progress saved" label', () => {
      render(<SemanticPill {...defaultProps} />);
      expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
    });

    it('renders artifact type and title', () => {
      render(<SemanticPill {...defaultProps} />);
      expect(screen.getByText(/PRD/)).toBeInTheDocument();
      expect(screen.getByText(/Product Requirements Document/)).toBeInTheDocument();
    });

    it('renders View link with correct href', () => {
      render(<SemanticPill {...defaultProps} />);
      const link = screen.getByRole('link', { name: /view/i });
      expect(link).toHaveAttribute('href', '/artifacts?id=art-1');
    });

    it('link has positive color and underline styling', () => {
      render(<SemanticPill {...defaultProps} />);
      const link = screen.getByRole('link', { name: /view/i });
      expect(link.className).toContain('positive');
      expect(link.className).toContain('underline');
    });
  });

  describe('[P1] AC-2 — Accessibility', () => {
    it('has role="status" for screen reader announcement', () => {
      render(<SemanticPill {...defaultProps} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('[P0] Story 3.6 AC-4 — Manual save variant (empty artifact props)', () => {
    const manualSaveProps = {
      artifactType: '',
      artifactTitle: '',
      viewHref: '',
    };

    it('renders "Progress saved" without View link when viewHref is empty', () => {
      render(<SemanticPill {...manualSaveProps} />);
      expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /view/i })).not.toBeInTheDocument();
    });

    it('renders "Progress saved" without type label when artifactType is empty', () => {
      render(<SemanticPill {...manualSaveProps} />);
      expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
      expect(screen.queryByText(/PRD|Architecture|Epics|UX/)).not.toBeInTheDocument();
    });

    it('renders "Progress saved" without title when artifactTitle is empty', () => {
      render(<SemanticPill {...manualSaveProps} />);
      expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
      expect(screen.queryByText(/Product Requirements Document/)).not.toBeInTheDocument();
    });

    it('renders full pill with View link when all props are present (regression guard)', () => {
      render(<SemanticPill {...defaultProps} />);
      expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view/i })).toBeInTheDocument();
      expect(screen.getByText(/PRD/)).toBeInTheDocument();
      expect(screen.getByText(/Product Requirements Document/)).toBeInTheDocument();
    });
  });

  describe('[P1] Story 3.6 AC-4 — Manual save accessibility', () => {
    it('manual-save variant has role="status" and aria-live="polite"', () => {
      render(<SemanticPill artifactType="" artifactTitle="" viewHref="" />);
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });
  });
});
