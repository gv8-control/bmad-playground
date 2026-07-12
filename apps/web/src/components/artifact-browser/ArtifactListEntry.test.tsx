/**
 * ATDD — Story 2.5: View a Single Artifact's Rendered Content
 * Story 5.4: Fix Token-Usage Drift (AC-5: hover:bg-surface-raised, text-text-3)
 * Component unit tests for ArtifactListEntry (Server Component, presentational).
 * Covers AC-1 (clickable list entry with selected state) and UX-DR16
 * (non-color state signaling, ARIA roles/labels, focus rings).
 *
 * GREEN PHASE: implementation complete. Story 2.4 delivered the base
 * component; Story 2.5 adds `href` and `selected` props and changes the
 * root element from `<div>` to `<Link>`. Story 5.4 fixes token-usage drift.
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

import { render, screen } from '@testing-library/react';
import { ArtifactListEntry } from './ArtifactListEntry';
import type { ArtifactType, ArtifactStatus } from '@bmad-easy/shared-types';

const COMPLETED_ENTRY = {
  type: 'prd' as ArtifactType,
  title: 'bmad-easy PRD',
  status: 'completed' as ArtifactStatus,
  lastModifiedAt: new Date('2026-06-14'),
  href: '/artifacts?id=art_1',
};

const IN_PROGRESS_ENTRY = {
  type: 'architecture' as ArtifactType,
  title: 'System Architecture',
  status: 'in-progress' as ArtifactStatus,
  lastModifiedAt: new Date('2026-06-15'),
  href: '/artifacts?id=art_2',
};

describe('ArtifactListEntry — render (AC-1, UX-DR12)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the type label text', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    expect(screen.getByText('PRD')).toBeInTheDocument();
  });

  it('[P0] renders the title', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    expect(screen.getByText('bmad-easy PRD')).toBeInTheDocument();
  });

  it('[P0] renders the status badge text', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it('[P0] renders the formatted date (Jun 14)', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    expect(screen.getByText('Jun 14')).toBeInTheDocument();
  });

  it('[P0] renders role="listitem"', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  it('[P0] renders aria-label in the format "{TYPE}: {title} — {STATUS}"', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute(
      'aria-label',
      'PRD: bmad-easy PRD — Completed',
    );
  });

  it('[P0] renders the in-progress status badge text (non-color signaling, UX-DR16)', () => {
    render(<ArtifactListEntry {...IN_PROGRESS_ENTRY} />);
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
  });
});

describe('ArtifactListEntry — link and selected state (AC-1, Story 2.5)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders as a link (<a> tag) with the correct href', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    const link = screen.getByRole('listitem');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/artifacts?id=art_1');
  });

  it('[P0] renders aria-current="true" when selected is true', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} selected />);
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('[P0] does NOT render aria-current when selected is false', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    expect(screen.getByRole('listitem')).not.toHaveAttribute('aria-current');
  });

  it('[P0] applies selected styling classes when selected', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} selected />);
    const item = screen.getByRole('listitem');
    expect(item.className).toContain('bg-surface-raised');
    expect(item.className).toContain('border-accent');
  });

  // Story 5.4, AC-5: hover uses full surface-raised, type label and dates use text-text-3
  it('[P0] applies hover:bg-surface-raised (no /60 opacity) when not selected (Story 5.4, AC-5)', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    const item = screen.getByRole('listitem');
    expect(item.className).toContain('hover:bg-surface-raised');
    expect(item.className).not.toContain('hover:bg-surface-raised/60');
  });

  it('[P0] type label uses text-text-3, not text-text-2 (Story 5.4, AC-5)', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    const typeLabel = screen.getByText('PRD');
    expect(typeLabel.className).toContain('text-text-3');
    expect(typeLabel.className).not.toContain('text-text-2');
  });

  it('[P0] date uses text-text-3, not text-text-2 (Story 5.4, AC-5)', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    const date = screen.getByText('Jun 14');
    expect(date.className).toContain('text-text-3');
    expect(date.className).not.toContain('text-text-2');
  });

  it('[P0] preserves role="listitem" and aria-label behavior with href', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} selected />);
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute('role', 'listitem');
    expect(item).toHaveAttribute(
      'aria-label',
      'PRD: bmad-easy PRD — Completed',
    );
  });

  it('[P0] has focus ring classes for keyboard navigation (UX-DR16)', () => {
    render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
    const item = screen.getByRole('listitem');
    expect(item.className).toContain('focus:ring-2');
    expect(item.className).toContain('focus:ring-accent');
    expect(item.className).toContain('focus:ring-offset-2');
    expect(item.className).toContain('focus:ring-offset-surface');
  });
});

describe('ArtifactListEntry — unknown type/status fallbacks (AC-1 edge)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P1] renders "Other" label for unknown type', () => {
    render(
      <ArtifactListEntry
        type={'unknown-type' as ArtifactType}
        title="Mystery Artifact"
        status="completed"
        lastModifiedAt={new Date('2026-06-14')}
        href="/artifacts?id=art_x"
      />,
    );
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('[P1] renders "Completed" for unknown status', () => {
    render(
      <ArtifactListEntry
        type="prd"
        title="bmad-easy PRD"
        status={'unknown-status' as ArtifactStatus}
        lastModifiedAt={new Date('2026-06-14')}
        href="/artifacts?id=art_x"
      />,
    );
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });
});
