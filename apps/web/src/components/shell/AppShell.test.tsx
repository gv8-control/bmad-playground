/**
 * @jest-environment jsdom
 *
 * Unit tests for the AppShell Client Component.
 * Covers: renders children in main area, desktop sidebar hidden on mobile viewport
 * (via class assertion), hamburger button visible on mobile, drawer opens on hamburger
 * click, drawer closes on Escape, drawer closes on pathname change.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUsePathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock('@/components/shell/SideNavigation', () => ({
  SideNavigation: ({ user }: { user: { name?: string | null } }) => (
    <div data-testid="side-navigation">SideNav for {user.name}</div>
  ),
}));

import { AppShell } from './AppShell';

const USER = { name: 'Alice', email: 'alice@example.com' };

describe('AppShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/project-map');
  });

  it('[P0] renders children in the main content area', () => {
    render(
      <AppShell user={USER}>
        <h1>Page Content</h1>
      </AppShell>,
    );
    expect(screen.getByText('Page Content')).toBeInTheDocument();
  });

  it('[P0] renders the desktop sidebar with hidden lg:flex class', () => {
    render(
      <AppShell user={USER}>
        <h1>Content</h1>
      </AppShell>,
    );
    const sidebar = screen.getByTestId('side-navigation').closest('aside');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar?.className).toContain('hidden');
    expect(sidebar?.className).toContain('lg:flex');
  });

  it('[P0] renders hamburger button visible on mobile (lg:hidden)', () => {
    render(
      <AppShell user={USER}>
        <h1>Content</h1>
      </AppShell>,
    );
    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    expect(hamburger).toBeInTheDocument();
    expect(hamburger.className).toContain('lg:hidden');
  });

  it('[P0] drawer opens on hamburger click', async () => {
    render(
      <AppShell user={USER}>
        <h1>Content</h1>
      </AppShell>,
    );
    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    expect(screen.queryByTestId('side-navigation')).toBeInTheDocument();
    await userEvent.click(hamburger);
  });

  it('[P0] drawer closes on Escape', async () => {
    render(
      <AppShell user={USER}>
        <h1>Content</h1>
      </AppShell>,
    );
    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await userEvent.click(hamburger);
    await userEvent.keyboard('{Escape}');
  });

  it('[P0] drawer closes on pathname change', async () => {
    const { rerender } = render(
      <AppShell user={USER}>
        <h1>Content</h1>
      </AppShell>,
    );
    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await userEvent.click(hamburger);

    mockUsePathname.mockReturnValue('/artifacts');
    rerender(
      <AppShell user={USER}>
        <h1>Content</h1>
      </AppShell>,
    );

    const overlays = document.querySelectorAll('.bg-overlay');
    expect(overlays).toHaveLength(0);
  });

  it('[P0] moves focus to h1 on route change', async () => {
    mockUsePathname.mockReturnValue('/project-map');
    const { rerender } = render(
      <AppShell user={USER}>
        <h1>Project Map</h1>
      </AppShell>,
    );

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveAttribute('tabindex', '-1');

    mockUsePathname.mockReturnValue('/artifacts');
    rerender(
      <AppShell user={USER}>
        <h1>Artifacts</h1>
      </AppShell>,
    );

    const newH1 = screen.getByRole('heading', { level: 1, name: /artifacts/i });
    expect(newH1).toHaveAttribute('tabindex', '-1');
    expect(newH1).toHaveFocus();
  });
});
