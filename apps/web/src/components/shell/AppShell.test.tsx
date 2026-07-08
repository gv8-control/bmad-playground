/**
 * @jest-environment jsdom
 *
 * Unit tests for the AppShell Client Component.
 * Covers: renders children in main area, desktop sidebar hidden on mobile viewport
 * (via class assertion), hamburger button visible on mobile, drawer opens on hamburger
 * click, drawer closes on Escape, drawer closes on pathname change.
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';

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
const CONVERSATIONS: { id: string; title: string | null }[] = [];

describe('AppShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/project-map');
  });

  it('[P0] renders children in the main content area', () => {
    render(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1>Page Content</h1>
      </AppShell>,
    );
    expect(screen.getByText('Page Content')).toBeInTheDocument();
  });

  it('[P0] renders the desktop sidebar with hidden lg:flex class', () => {
    render(
      <AppShell user={USER} conversations={CONVERSATIONS}>
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
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1>Content</h1>
      </AppShell>,
    );
    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    expect(hamburger).toBeInTheDocument();
    expect(hamburger.className).toContain('lg:hidden');
  });

  it('[P0] drawer opens on hamburger click', async () => {
    render(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1>Content</h1>
      </AppShell>,
    );
    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    expect(screen.queryByTestId('side-navigation')).toBeInTheDocument();
    await userEvent.click(hamburger);
    await waitFor(() => {
      expect(document.querySelectorAll('.bg-overlay')).toHaveLength(1);
    });
    expect(screen.getByTestId('sheet-content')).toBeVisible();
  });

  it('[P0] drawer closes on Escape', async () => {
    render(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1>Content</h1>
      </AppShell>,
    );
    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await userEvent.click(hamburger);
    await waitFor(() => {
      expect(document.querySelectorAll('.bg-overlay')).toHaveLength(1);
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(document.querySelectorAll('.bg-overlay')).toHaveLength(0);
    });
    expect(screen.queryByTestId('sheet-content')).not.toBeInTheDocument();
  });

  it('[P0] drawer closes on pathname change', async () => {
    const { rerender } = render(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1>Content</h1>
      </AppShell>,
    );
    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await userEvent.click(hamburger);

    mockUsePathname.mockReturnValue('/artifacts');
    rerender(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1>Content</h1>
      </AppShell>,
    );

    const overlays = document.querySelectorAll('.bg-overlay');
    expect(overlays).toHaveLength(0);
    expect(screen.queryByTestId('sheet-content')).not.toBeInTheDocument();
  });

  it('[P0] moves focus to h1 on route change', async () => {
    mockUsePathname.mockReturnValue('/project-map');
    const { rerender } = render(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1 tabIndex={-1}>Project Map</h1>
      </AppShell>,
    );

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveAttribute('tabindex', '-1');

    mockUsePathname.mockReturnValue('/artifacts');
    rerender(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1 tabIndex={-1}>Artifacts</h1>
      </AppShell>,
    );

    const newH1 = screen.getByRole('heading', { level: 1, name: /artifacts/i });
    expect(newH1).toHaveAttribute('tabindex', '-1');
    expect(newH1).toHaveFocus();
  });

  it('[P0] moves focus to an h1 that mounts asynchronously (e.g. streamed/Suspense content)', async () => {
    // Simulates a page whose <h1> is not present on first paint (behind a
    // Suspense boundary or streamed in) — it mounts after a deferred state
    // update rather than being present synchronously.
    function DeferredHeading() {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        const id = setTimeout(() => setReady(true), 0);
        return () => clearTimeout(id);
      }, []);
      if (!ready) {
        return <button>Loading placeholder</button>;
      }
      return <h1 tabIndex={-1}>Deferred Artifacts</h1>;
    }

    mockUsePathname.mockReturnValue('/artifacts');
    render(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <DeferredHeading />
      </AppShell>,
    );

    // Synchronously, no h1 exists yet — focus falls back to the first
    // interactive element without throwing or hanging.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    const deferredH1 = await screen.findByRole('heading', {
      level: 1,
      name: /deferred artifacts/i,
    });
    await waitFor(() => expect(deferredH1).toHaveAttribute('tabindex', '-1'));
    await waitFor(() => expect(deferredH1).toHaveFocus());
  });

  it('[P0] does not add delay when the h1 is already present (no regression)', async () => {
    mockUsePathname.mockReturnValue('/project-map');
    render(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1 tabIndex={-1}>Immediate Heading</h1>
      </AppShell>,
    );

    // Focus lands synchronously, before any microtask/timer flush.
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(h1).toHaveFocus();
  });
});
