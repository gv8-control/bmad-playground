/**
 * @jest-environment jsdom
 *
 * HYD-UNIT-001: AppShell hydration round-trip test.
 *
 * Verifies that AppShell renders without hydration mismatches when
 * server-rendered HTML is hydrated on the client. This guards against
 * the class of defect where imperative DOM manipulation in useEffect
 * (e.g. setAttribute) causes the hydrated tree to diverge from the
 * server HTML.
 */

import '@testing-library/jest-dom';
import { renderAndHydrate } from '@/lib/test/hydrate-root-utils';

const mockUsePathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

// Mocks use require('react').createElement instead of JSX because JSX in
// jest.mock factories compiles to _jsxs (array children) via react/jsx-runtime,
// and renderToStaticMarkup serializes array children as JSON instead of text.
// createElement with a single string child avoids this.
jest.mock('@/components/shell/SideNavigation', () => {
  const { createElement } = require('react');
  return {
    SideNavigation: ({ user }: { user: { name?: string | null } }) =>
      createElement(
        'div',
        { 'data-testid': 'side-navigation' },
        `SideNav for ${user.name}`,
      ),
  };
});

jest.mock('@/components/ui/sheet', () => {
  const { createElement, Fragment } = require('react');
  return {
    Sheet: ({ children }: { children: React.ReactNode }) =>
      createElement('div', { 'data-testid': 'sheet' }, children),
    SheetTrigger: ({ children }: { children: React.ReactNode }) =>
      createElement(Fragment, null, children),
    SheetContent: ({ children }: { children: React.ReactNode }) =>
      createElement('div', { 'data-testid': 'sheet-content' }, children),
    SheetClose: () => null,
  };
});

import { AppShell } from './AppShell';

const USER = { name: 'Alice', email: 'alice@example.com' };
const CONVERSATIONS: { id: string; title: string | null }[] = [];

describe('AppShell hydration (HYD-UNIT-001)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/project-map');
  });

  it('[P0] hydrates without console errors (SSR→client round-trip)', async () => {
    const { consoleErrors } = await renderAndHydrate(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        <h1 tabIndex={-1}>Test Page</h1>
      </AppShell>,
    );
    expect(consoleErrors).toEqual([]);
  });
});
