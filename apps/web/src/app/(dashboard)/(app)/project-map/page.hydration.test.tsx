/**
 * @jest-environment jsdom
 *
 * HYD-UNIT-002: Integrated tree hydration round-trip test.
 *
 * Renders the REAL ProjectMapPage (async server component) wrapped in the
 * REAL AppShell, server-renders the full tree to static markup, then
 * hydrates it. Asserts zero console errors during hydration.
 *
 * Only data dependencies are mocked — the component tree (AppShell,
 * SideNavigation, ProjectMapArtifacts, ArtifactCard, RefreshButton, etc.)
 * is real.
 *
 * Note: Uses jsdom (not node) because hydrateRoot requires a DOM document.
 * renderToStaticMarkup works in any environment; hydration requires jsdom.
 */

import '@testing-library/jest-dom';
import { renderAndHydrate } from '@/lib/test/hydrate-root-utils';

// --- Data dependency mocks ---

const mockRedirect = jest.fn();
const mockUsePathname = jest.fn();
const mockUseRouter = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
  usePathname: () => mockUsePathname(),
  useRouter: () => mockUseRouter(),
}));

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    repoConnection: { findUnique: mockFindUnique },
    artifact: { findMany: mockFindMany },
  }),
}));

const mockGetCredentialHealthStatus = jest.fn();
jest.mock('@/actions/credential-health.actions', () => ({
  getCredentialHealthStatus: (...args: unknown[]) =>
    mockGetCredentialHealthStatus(...args),
  reauthorizeGitHub: jest.fn(),
}));

const mockSyncArtifactsAction = jest.fn();
jest.mock('@/actions/artifacts.actions', () => ({
  syncArtifactsAction: (...args: unknown[]) => mockSyncArtifactsAction(...args),
}));

import { AppShell } from '@/components/shell/AppShell';
import ProjectMapPage from './page';

const USER = { name: 'Alice', email: 'alice@example.com' };
const CONVERSATIONS: { id: string; title: string | null }[] = [];

const SESSION = { userId: 'usr_abc123' };
const REPO_CONNECTION = { id: 'conn_1' };

const ARTIFACTS = [
  {
    id: 'art_1',
    repoConnectionId: 'conn_1',
    path: '_bmad-output/prd.md',
    type: 'prd',
    title: 'bmad-easy PRD',
    status: 'completed',
    lastModifiedAt: new Date('2026-06-14'),
  },
  {
    id: 'art_2',
    repoConnectionId: 'conn_1',
    path: '_bmad-output/architecture.md',
    type: 'architecture',
    title: 'System Architecture',
    status: 'in-progress',
    lastModifiedAt: new Date('2026-06-15'),
  },
];

const HEALTHY = { success: true, status: 'healthy' as const };

describe('ProjectMapPage integrated hydration (HYD-UNIT-002)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(REPO_CONNECTION);
    mockFindMany.mockResolvedValue(ARTIFACTS);
    mockGetCredentialHealthStatus.mockResolvedValue(HEALTHY);
    mockUsePathname.mockReturnValue('/project-map');
    mockUseRouter.mockReturnValue({
      refresh: jest.fn(),
      push: jest.fn(),
      replace: jest.fn(),
    });
  });

  it('[P0] hydrates the real AppShell + ProjectMapPage tree without console errors', async () => {
    const pageElement = await ProjectMapPage();

    const { consoleErrors } = await renderAndHydrate(
      <AppShell user={USER} conversations={CONVERSATIONS}>
        {pageElement}
      </AppShell>,
    );

    expect(consoleErrors).toEqual([]);
  });
});
