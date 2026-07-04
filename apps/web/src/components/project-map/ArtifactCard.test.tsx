/**
 * ATDD — Story 2.2: View the Project Map (base component)
 * Story 2.6: Navigate from the Project Map to an Artifact (href prop, link behavior)
 * Component unit tests for ArtifactCard (Server Component, presentational).
 * Covers AC-1 (artifact list with cards), AC-2 (in-progress visual distinction),
 * UX-DR16 (non-color state signaling), and Story 2.6 AC-1/AC-2 (click-to-navigate).
 *
 * Story 2.2 and Story 2.6 tests are GREEN (component delivered as a <Link>
 * with href, aria-label, and hover/focus styling).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

import { render, screen } from '@testing-library/react';
import { ArtifactCard } from './ArtifactCard';
import type { ArtifactType, ArtifactStatus } from '@bmad-easy/shared-types';

const COMPLETED_ARTIFACT = {
  type: 'prd' as ArtifactType,
  title: 'bmad-easy PRD',
  status: 'completed' as ArtifactStatus,
  href: '/artifacts?id=art_1',
};

const IN_PROGRESS_ARTIFACT = {
  type: 'architecture' as ArtifactType,
  title: 'System Architecture',
  status: 'in-progress' as ArtifactStatus,
  href: '/artifacts?id=art_2',
};

describe('ArtifactCard — render (AC-1, UX-DR11)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the type label, title, and completed badge', () => {
    render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
    expect(screen.getByText('PRD')).toBeInTheDocument();
    expect(screen.getByText('bmad-easy PRD')).toBeInTheDocument();
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it('[P0] renders the in-progress badge with distinct style (caution border, not just color) (AC-2, UX-DR11)', () => {
    render(<ArtifactCard {...IN_PROGRESS_ARTIFACT} />);
    const badge = screen.getByText(/in progress/i);
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('caution');
  });

  it('[P0] both badges include text labels — never color alone (UX-DR16)', () => {
    const { rerender } = render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
    expect(screen.getByText(/completed/i)).toBeInTheDocument();

    rerender(<ArtifactCard {...IN_PROGRESS_ARTIFACT} />);
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
  });
});

describe('ArtifactCard — type label mapping (AC-1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P1] renders all 12 type labels correctly', () => {
    const cases: Array<{ type: ArtifactType; label: string }> = [
      { type: 'brainstorming', label: 'Brainstorming' },
      { type: 'prd', label: 'PRD' },
      { type: 'architecture', label: 'Architecture' },
      { type: 'epics', label: 'Epics' },
      { type: 'ux', label: 'UX' },
      { type: 'technical-research', label: 'Technical Research' },
      { type: 'market-research', label: 'Market Research' },
      { type: 'domain-research', label: 'Domain Research' },
      { type: 'product-brief', label: 'Brief' },
      { type: 'prfaq', label: 'PR/FAQ' },
      { type: 'test-arch', label: 'Test Architecture' },
      { type: 'other', label: 'Other' },
    ];

    for (const { type, label } of cases) {
      const { unmount } = render(
        <ArtifactCard
          type={type}
          title="Test"
          status="completed"
          href="/artifacts?id=test"
        />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('ArtifactCard — badge visual distinction (AC-2, UX-DR11)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P1] completed badge is visually muted (transparent bg, text-2) vs in-progress (caution bg, caution text)', () => {
    const { rerender } = render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
    const completedBadge = screen.getByText(/completed/i);
    expect(completedBadge.className).toContain('bg-transparent');
    expect(completedBadge.className).toContain('text-text-2');

    rerender(<ArtifactCard {...IN_PROGRESS_ARTIFACT} />);
    const inProgressBadge = screen.getByText(/in progress/i);
    expect(inProgressBadge.className).toContain('bg-caution-bg');
    expect(inProgressBadge.className).toContain('text-caution');
  });
});

describe('ArtifactCard — link behavior (AC-1, AC-2, Story 2.6)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders as a link (<a> tag) with the correct href', () => {
    render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
    const item = screen.getByRole('listitem');
    expect(item.tagName).toBe('A');
    expect(item).toHaveAttribute('href', '/artifacts?id=art_1');
  });

  it('[P0] renders aria-label in the format "{TYPE}: {title} — {STATUS}"', () => {
    render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute(
      'aria-label',
      'PRD: bmad-easy PRD — Completed',
    );
  });

  it('[P1] renders aria-label for in-progress artifact with correct status label', () => {
    render(<ArtifactCard {...IN_PROGRESS_ARTIFACT} />);
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute(
      'aria-label',
      'Architecture: System Architecture — In progress',
    );
  });

  it('[P0] has focus ring classes for keyboard navigation (UX-DR16)', () => {
    render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
    const item = screen.getByRole('listitem');
    expect(item.className).toContain('focus:ring-2');
    expect(item.className).toContain('focus:ring-accent');
    expect(item.className).toContain('focus:ring-offset-2');
    expect(item.className).toContain('focus:ring-offset-surface');
  });

  it('[P0] has hover border classes', () => {
    render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
    const item = screen.getByRole('listitem');
    expect(item.className).toContain('hover:border-text-3');
  });

  it('[P0] preserves role="listitem" on the link element', () => {
    render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute('role', 'listitem');
  });
});
