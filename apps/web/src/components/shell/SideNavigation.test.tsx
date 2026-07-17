/**
 * @jest-environment jsdom
 *
 * Unit tests for the SideNavigation Client Component.
 * Covers: renders all nav items, active item highlighted based on pathname,
 * avatar shows correct initials, "New Conversation" button links to /conversations/new,
 * conversation list section exists but is empty.
 * Story 3.2 covers: AC-4 (conversation list renders titles as links, active highlight,
 * empty state).
 * Story 5.2 covers: AC-1 (wordmark interpunct), AC-2 (wordmark border-b),
 * AC-3 (Settings label), AC-4 (consistent inset pill), AC-5 (single padding),
 * AC-6 (button spacing/alignment), AC-9 (separator styling), AC-10 (top-clustered nav).
 * Story 5.4 covers: AC-6 (nav right border border-surface-raised).
 *
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

  it('[P0] renders the product wordmark "bmad·easy" with accent interpunct (Story 5.2, AC-1)', () => {
    render(<SideNavigation user={USER} />);
    const wordmark = screen.getByTestId('product-wordmark');
    expect(wordmark).toHaveTextContent('bmad·easy');
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

  describe('[P0] Story 5.2 — Shell Structural Drift (AC-1, 2, 3, 4, 5, 6, 9, 10)', () => {
    describe('AC-1: Wordmark brand mark with accent interpunct', () => {
      it('wordmark has tracking-tight class (letter-spacing -0.025em)', () => {
        render(<SideNavigation user={USER} />);
        const wordmark = screen.getByTestId('product-wordmark');
        expect(wordmark.className).toContain('tracking-tight');
      });
    });

    describe('AC-2: Wordmark border-bottom separator', () => {
      it('wordmark has border-b class', () => {
        render(<SideNavigation user={USER} />);
        const wordmark = screen.getByTestId('product-wordmark');
        expect(wordmark.className).toContain('border-b');
      });

      it('wordmark border uses surface-raised color', () => {
        render(<SideNavigation user={USER} />);
        const wordmark = screen.getByTestId('product-wordmark');
        expect(wordmark.className).toContain('border-surface-raised');
      });
    });

    describe('AC-3: "Settings" visible label next to avatar', () => {
      it('settings link contains visible "Settings" text', () => {
        render(<SideNavigation user={USER} />);
        const settingsLink = screen.getByRole('link', { name: /alice wonderland.*settings/i });
        expect(settingsLink).toHaveTextContent('Settings');
      });
    });

    describe('AC-4: Consistent inset pill styling for all nav items', () => {
      it('active Project Map item has mx-2 (inset margin)', () => {
        mockUsePathname.mockReturnValue('/project-map');
        render(<SideNavigation user={USER} />);
        const projectMapLink = screen.getByRole('link', { name: /project map/i });
        expect(projectMapLink.className).toContain('mx-2');
      });

      it('active Project Map item has rounded-md', () => {
        mockUsePathname.mockReturnValue('/project-map');
        render(<SideNavigation user={USER} />);
        const projectMapLink = screen.getByRole('link', { name: /project map/i });
        expect(projectMapLink.className).toContain('rounded-md');
      });

      it('all nav items use px-2 consistently (not px-3)', () => {
        mockUsePathname.mockReturnValue('/project-map');
        render(<SideNavigation user={USER} />);
        const projectMapLink = screen.getByRole('link', { name: /project map/i });
        expect(projectMapLink.className).toContain('px-2');
        expect(projectMapLink.className).not.toMatch(/\bpx-3\b/);
      });

      it('inactive items also have mx-2 (consistent inset)', () => {
        mockUsePathname.mockReturnValue('/artifacts');
        render(<SideNavigation user={USER} />);
        const projectMapLink = screen.getByRole('link', { name: /project map/i });
        expect(projectMapLink.className).toContain('mx-2');
      });

      it('active Artifact Browser item has mx-2 and rounded-md', () => {
        mockUsePathname.mockReturnValue('/artifacts');
        render(<SideNavigation user={USER} />);
        const artifactsLink = screen.getByRole('link', { name: /artifact browser/i });
        expect(artifactsLink.className).toContain('mx-2');
        expect(artifactsLink.className).toContain('rounded-md');
      });

      it('active Settings item has mx-2 and rounded-md', () => {
        mockUsePathname.mockReturnValue('/settings');
        render(<SideNavigation user={USER} />);
        const settingsLink = screen.getByRole('link', { name: /alice wonderland.*settings/i });
        expect(settingsLink.className).toContain('mx-2');
        expect(settingsLink.className).toContain('rounded-md');
      });

      it('active conversation item has mx-2 and rounded-md', () => {
        mockUsePathname.mockReturnValue('/conversations/conv-1');
        render(
          <SideNavigation
            user={USER}
            conversations={[{ id: 'conv-1', title: 'Test Conversation' }]}
          />,
        );
        const convLink = screen.getByRole('link', { name: /test conversation/i });
        expect(convLink.className).toContain('mx-2');
        expect(convLink.className).toContain('rounded-md');
      });
    });

    describe('AC-5: Single horizontal padding (no doubling)', () => {
      it('nav links use px-2 (8px horizontal padding)', () => {
        mockUsePathname.mockReturnValue('/settings');
        render(<SideNavigation user={USER} />);
        const projectMapLink = screen.getByRole('link', { name: /project map/i });
        expect(projectMapLink.className).toContain('px-2');
        expect(projectMapLink.className).not.toContain('px-4');
      });

      it('conversation list container does NOT have px-3 (no doubled padding)', () => {
        render(<SideNavigation user={USER} />);
        const conversationList = screen.getByTestId('conversation-list');
        expect(conversationList.className).not.toMatch(/\bpx-3\b/);
      });
    });

    describe('AC-6: Nav button spacing and alignment', () => {
      it('"New Conversation" button text starts with "+"', () => {
        render(<SideNavigation user={USER} />);
        const link = screen.getByRole('link', { name: /new conversation/i });
        expect(link).toHaveTextContent(/^\+/);
      });

      it('"New Conversation" button has mt-3 (top margin)', () => {
        render(<SideNavigation user={USER} />);
        const link = screen.getByRole('link', { name: /new conversation/i });
        expect(link.className).toContain('mt-3');
      });

      it('"New Conversation" button has mb-2 (bottom margin)', () => {
        render(<SideNavigation user={USER} />);
        const link = screen.getByRole('link', { name: /new conversation/i });
        expect(link.className).toContain('mb-2');
      });

      it('"New Conversation" button has flex items-center justify-center', () => {
        render(<SideNavigation user={USER} />);
        const link = screen.getByRole('link', { name: /new conversation/i });
        expect(link.className).toContain('flex');
        expect(link.className).toContain('items-center');
        expect(link.className).toContain('justify-center');
      });
    });

    describe('AC-9: Nav separator styling', () => {
      it('separator has my-2 (not my-4)', () => {
        render(<SideNavigation user={USER} />);
        const nav = screen.getByRole('navigation');
        const separators = nav.querySelectorAll('.border-t');
        const separator = Array.from(separators).find(
          (el) => !el.getAttribute('data-testid'),
        );
        expect(separator).toBeDefined();
        expect(separator!.className).toContain('my-2');
        expect(separator!.className).not.toContain('my-4');
      });

      it('separator has mx-4 (not mx-3)', () => {
        render(<SideNavigation user={USER} />);
        const nav = screen.getByRole('navigation');
        const separators = nav.querySelectorAll('.border-t');
        const separator = Array.from(separators).find(
          (el) => !el.getAttribute('data-testid'),
        );
        expect(separator).toBeDefined();
        expect(separator!.className).toContain('mx-4');
        expect(separator!.className).not.toMatch(/\bmx-3\b/);
      });

      it('separator uses border-surface-raised (not border-border-subtle)', () => {
        render(<SideNavigation user={USER} />);
        const nav = screen.getByRole('navigation');
        const separators = nav.querySelectorAll('.border-t');
        const separator = Array.from(separators).find(
          (el) => !el.getAttribute('data-testid'),
        );
        expect(separator).toBeDefined();
        expect(separator!.className).toContain('border-surface-raised');
        expect(separator!.className).not.toContain('border-border-subtle');
      });
    });

    describe('AC-10: Nav links grouped with conversation list (top-clustered)', () => {
      it('separator and nav links are inside flex-1 container alongside conversation list', () => {
        render(<SideNavigation user={USER} />);
        const conversationList = screen.getByTestId('conversation-list');
        const flexContainer = conversationList.parentElement;
        expect(flexContainer).not.toBeNull();
        expect(flexContainer!.className).toContain('flex-1');

        const flexChildren = Array.from(flexContainer!.children);
        expect(flexChildren).toContain(conversationList);

        const projectMapLink = screen.getByRole('link', { name: /project map/i });
        const artifactsLink = screen.getByRole('link', { name: /artifact browser/i });
        expect(flexContainer!.contains(projectMapLink)).toBe(true);
        expect(flexContainer!.contains(artifactsLink)).toBe(true);
      });

      it('with 0 conversations, separator and nav links appear right below New Conversation button (top-clustered)', () => {
        render(<SideNavigation user={USER} conversations={[]} />);
        const conversationList = screen.getByTestId('conversation-list');
        expect(conversationList.children).toHaveLength(0);

        const flexContainer = conversationList.parentElement;
        expect(flexContainer).not.toBeNull();
        expect(flexContainer!.className).toContain('flex-1');

        const projectMapLink = screen.getByRole('link', { name: /project map/i });
        expect(flexContainer!.contains(projectMapLink)).toBe(true);
      });

      it('flex-1 container has py-1 (matching mockup padding 4px 0)', () => {
        render(<SideNavigation user={USER} />);
        const conversationList = screen.getByTestId('conversation-list');
        const flexContainer = conversationList.parentElement;
        expect(flexContainer).not.toBeNull();
        expect(flexContainer!.className).toContain('py-1');
      });

      it('conversation list wrapper does NOT have mt-4 (gap removed)', () => {
        render(<SideNavigation user={USER} />);
        const conversationList = screen.getByTestId('conversation-list');
        expect(conversationList.className).not.toContain('mt-4');
      });
    });
  });

  // ─── Story 5.4: Hairline border token (AC-6) ───────────────────────────────
  //
  // Story 5.4: AC-6: Nav right border uses border-surface-raised (not border-border-subtle).

  describe('[P0] Story 5.4, AC-6 — Nav right border token', () => {
    it('nav element uses border-surface-raised on right border, not border-border-subtle (AC-6)', () => {
      render(<SideNavigation user={USER} />);
      const nav = screen.getByRole('navigation');
      expect(nav.className).toContain('border-surface-raised');
      expect(nav.className).not.toContain('border-border-subtle');
    });
  });

  // ─── Story 5.4: Scrollbar hiding (AC-7) ────────────────────────────────────
  //
  // Story 5.4: AC-7: Scrollable conversation list panel hides scrollbars via no-scrollbar.

  describe('[P0] Story 5.4, AC-7 — Scrollbar hiding on conversation list', () => {
    it('conversation list scrollable panel has no-scrollbar class (AC-7)', () => {
      render(<SideNavigation user={USER} />);
      const conversationList = screen.getByTestId('conversation-list');
      expect(conversationList.className).toContain('no-scrollbar');
    });
  });

  // ─── Focus ring clearance on scrollable conversation list ─────────────────
  //
  // The conversation list has overflow-y-auto, which forces overflow-x to
  // compute to "auto" per CSS spec. This clips box-shadows (focus rings)
  // that extend beyond the container's padding box. Adding py-1 (4px) padding
  // gives the 4px focus ring (2px offset + 2px ring) room to render.

  describe('[P0] Focus ring clearance on scrollable conversation list', () => {
    it('conversation list has py-1 padding for focus ring clearance', () => {
      render(<SideNavigation user={USER} />);
      const conversationList = screen.getByTestId('conversation-list');
      expect(conversationList.className).toContain('py-1');
    });
  });
});
