/**
 * @jest-environment jsdom
 *
 * Unit tests for the SideNavigation Client Component.
 * Covers: renders all nav items, active item highlighted based on pathname,
 * avatar shows correct initials, "New Conversation" button links to /conversations/new,
 * conversation list section exists but is empty.
 * Story 3.2 covers: AC-4 (conversation list renders titles as links, active highlight,
 * empty state).
 *
 * TDD GREEN PHASE: all tests are un-skipped and passing.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

const mockUsePathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

import { SideNavigation } from './SideNavigation';

const USER = { name: 'Alice Wonderland', email: 'alice@example.com' };

describe('SideNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/project-map');
  });

  it('[P0] renders the product wordmark "bmad-easy"', () => {
    render(<SideNavigation user={USER} />);
    expect(screen.getByText('bmad-easy')).toBeInTheDocument();
  });

  it('[P0] renders "New Conversation" button linking to /conversations/new', () => {
    render(<SideNavigation user={USER} />);
    const link = screen.getByRole('link', { name: /new conversation/i });
    expect(link).toHaveAttribute('href', '/conversations/new');
  });

  it('[P0] renders Project Map link', () => {
    render(<SideNavigation user={USER} />);
    const link = screen.getByRole('link', { name: /project map/i });
    expect(link).toHaveAttribute('href', '/project-map');
  });

  it('[P0] renders Artifact Browser link', () => {
    render(<SideNavigation user={USER} />);
    const link = screen.getByRole('link', { name: /artifact browser/i });
    expect(link).toHaveAttribute('href', '/artifacts');
  });

  it('[P0] renders Settings avatar link', () => {
    render(<SideNavigation user={USER} />);
    const link = screen.getByRole('link', { name: /alice wonderland.*settings/i });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('[P0] highlights Project Map as active when pathname is /project-map', () => {
    mockUsePathname.mockReturnValue('/project-map');
    render(<SideNavigation user={USER} />);
    const projectMapLink = screen.getByRole('link', { name: /project map/i });
    expect(projectMapLink.className).toContain('bg-surface-raised');
    expect(projectMapLink.className).toContain('text-text-1');
  });

  it('[P0] highlights Project Map as active when pathname is /', () => {
    mockUsePathname.mockReturnValue('/');
    render(<SideNavigation user={USER} />);
    const projectMapLink = screen.getByRole('link', { name: /project map/i });
    expect(projectMapLink.className).toContain('bg-surface-raised');
  });

  it('[P0] highlights Artifact Browser as active when pathname starts with /artifacts', () => {
    mockUsePathname.mockReturnValue('/artifacts/some-id');
    render(<SideNavigation user={USER} />);
    const artifactsLink = screen.getByRole('link', { name: /artifact browser/i });
    expect(artifactsLink.className).toContain('bg-surface-raised');
  });

  it('[P0] highlights Settings as active when pathname is /settings', () => {
    mockUsePathname.mockReturnValue('/settings');
    render(<SideNavigation user={USER} />);
    const settingsLink = screen.getByRole('link', { name: /alice wonderland.*settings/i });
    expect(settingsLink.className).toContain('bg-surface-raised');
  });

  it('[P0] does not highlight Project Map when on /artifacts', () => {
    mockUsePathname.mockReturnValue('/artifacts');
    render(<SideNavigation user={USER} />);
    const projectMapLink = screen.getByRole('link', { name: /project map/i });
    expect(projectMapLink.className).toContain('text-text-2');
    expect(projectMapLink.className).not.toContain('text-text-1');
  });

  it('[P0] shows correct initials for full name', () => {
    render(<SideNavigation user={USER} />);
    expect(screen.getByText('AW')).toBeInTheDocument();
  });

  it('[P1] shows correct initials for single name', () => {
    render(<SideNavigation user={{ name: 'Cher', email: 'cher@example.com' }} />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('[P1] shows "?" when no name or email', () => {
    render(<SideNavigation user={{ name: null, email: null }} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('[P1] uses email in aria-label when name is absent', () => {
    render(<SideNavigation user={{ name: null, email: 'bob@example.com' }} />);
    expect(screen.getByRole('link', { name: /bob@example.com.*settings/i })).toBeInTheDocument();
  });

  it('[P1] uses "User" in aria-label when neither name nor email', () => {
    render(<SideNavigation user={{ name: null, email: null }} />);
    expect(screen.getByRole('link', { name: /user.*settings/i })).toBeInTheDocument();
  });

  it('[P0] conversation list section exists but is empty', () => {
    render(<SideNavigation user={USER} />);
    const conversationSection = screen.getByTestId('conversation-list');
    expect(conversationSection).toBeInTheDocument();
    expect(conversationSection.children).toHaveLength(0);
  });

  describe('[P0] Story 3.2 — Conversation List (AC-4)', () => {
    const CONVERSATIONS = [
      { id: 'conv-1', title: 'PRD Discussion' },
      { id: 'conv-2', title: 'Architecture Review' },
    ];

    it('renders conversation titles as links', () => {
      render(<SideNavigation user={USER} conversations={CONVERSATIONS} />);

      const link1 = screen.getByRole('link', { name: /PRD Discussion/i });
      const link2 = screen.getByRole('link', { name: /Architecture Review/i });

      expect(link1).toHaveAttribute('href', '/conversations/conv-1');
      expect(link2).toHaveAttribute('href', '/conversations/conv-2');
    });

    it('highlights the active conversation', () => {
      mockUsePathname.mockReturnValue('/conversations/conv-1');
      render(<SideNavigation user={USER} conversations={CONVERSATIONS} />);

      const activeLink = screen.getByRole('link', { name: /PRD Discussion/i });
      expect(activeLink.className).toContain('bg-surface-raised');
      expect(activeLink.className).toContain('text-text-1');
    });

    it('shows no conversation list items when conversations array is empty', () => {
      render(<SideNavigation user={USER} conversations={[]} />);

      const conversationSection = screen.getByTestId('conversation-list');
      expect(conversationSection.children).toHaveLength(0);
    });
  });
});
