/**
 * @jest-environment node
 *
 * ATDD — Story 2.2: View the Project Map (base page)
 * Story 2.6: Navigate from the Project Map to an Artifact (href passing)
 * Server Component unit tests for ProjectMapPage.
 * Covers AC-1 (artifact list), AC-3 (empty state), AC-4 (credential error banner),
 * AC-5 (loading skeleton data-fetching), page-load sync behavior, and
 * Story 2.6 AC-1/AC-2 (passes href to each ArtifactCard).
 *
 * Child component rendering (ArtifactCard, CredentialErrorBanner) is verified
 * by their own co-located component tests. This page test focuses on
 * data-fetching decisions and inline content rendering. Child components are
 * mocked as render stubs to isolate the page test from their internal logic.
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
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
}));

const mockSyncArtifactsAction = jest.fn();
jest.mock('@/actions/artifacts.actions', () => ({
  syncArtifactsAction: (...args: unknown[]) => mockSyncArtifactsAction(...args),
}));

jest.mock('@/components/project-map/ProjectMapArtifacts', () => ({
  ProjectMapArtifacts: ({ artifacts }: { artifacts: { id: string; type: string; title: string; status: string; href: string }[] }) =>
    `ProjectMapArtifacts:${artifacts.map((a) => `${a.type}:${a.title}:${a.status}:${a.href}`).join('|')}`,
}));

jest.mock('@/components/project-map/CredentialErrorBanner', () => ({
  CredentialErrorBanner: () => 'CredentialErrorBanner',
}));

jest.mock('@/components/project-map/RefreshButton', () => ({
  RefreshButton: () => 'RefreshButton',
}));

import { renderToStaticMarkup } from 'react-dom/server';
import ProjectMapPage from './page';

const SESSION = { userId: 'usr_abc123' };
const REPO_CONNECTION = { id: 'conn_1', repoUrl: 'https://github.com/a/b' };

const ARTIFACTS = [
  {
    id: 'art_1',
    repoConnectionId: 'conn_1',
    path: '_bmad-output/prd.md',
    type: 'prd',
    title: 'bmad-easy PRD',
    status: 'completed',
    lastModifiedAt: new Date('2026-06-14'),
    content: '# PRD',
    createdAt: new Date('2026-06-14'),
    updatedAt: new Date('2026-06-14'),
  },
  {
    id: 'art_2',
    repoConnectionId: 'conn_1',
    path: '_bmad-output/architecture.md',
    type: 'architecture',
    title: 'System Architecture',
    status: 'in-progress',
    lastModifiedAt: new Date('2026-06-15'),
    content: '# Architecture',
    createdAt: new Date('2026-06-15'),
    updatedAt: new Date('2026-06-15'),
  },
];

const HEALTHY = { success: true, status: 'healthy' as const };
const FAILED = { success: true, status: 'failed' as const };

function setupArtifacts(artifacts: typeof ARTIFACTS | []) {
  mockAuth.mockResolvedValue(SESSION);
  mockFindUnique.mockResolvedValue(REPO_CONNECTION);
  mockFindMany.mockResolvedValue(artifacts);
  mockGetCredentialHealthStatus.mockResolvedValue(HEALTHY);
}

async function renderPage() {
  const element = await ProjectMapPage();
  return renderToStaticMarkup(element);
}

describe('ProjectMapPage — artifact list (AC-1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] queries artifacts by repoConnectionId ordered by lastModifiedAt desc', async () => {
    setupArtifacts(ARTIFACTS);
    await renderPage();
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { repoConnectionId: REPO_CONNECTION.id },
      orderBy: { lastModifiedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        lastModifiedAt: true,
        path: true,
      },
    });
  });

  it('[P0] renders artifact titles when Postgres has artifacts', async () => {
    setupArtifacts(ARTIFACTS);
    const html = await renderPage();
    expect(html).toContain('bmad-easy PRD');
    expect(html).toContain('System Architecture');
  });
});

describe('ProjectMapPage — empty state (AC-3, UX-DR19)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders empty state when no artifacts and sync returns empty', async () => {
    setupArtifacts([]);
    mockSyncArtifactsAction.mockResolvedValue({
      success: true,
      artifactsUpserted: 0,
      artifactsDeleted: 0,
    });
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const html = await renderPage();
    expect(html).toContain('Start your first conversation to create an artifact.');
  });

  it('[P1] renders empty state when sync returns NOT_FOUND and Postgres is empty', async () => {
    setupArtifacts([]);
    mockSyncArtifactsAction.mockResolvedValue({
      error: 'Repository not found',
      errorCode: 'NOT_FOUND',
    });
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const html = await renderPage();
    expect(html).toContain('Start your first conversation to create an artifact.');
  });
});

describe('ProjectMapPage — credential error banner (AC-4, UX-DR10)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] calls getCredentialHealthStatus to check credential health', async () => {
    setupArtifacts(ARTIFACTS);
    await renderPage();
    expect(mockGetCredentialHealthStatus).toHaveBeenCalled();
  });

  it('[P0] does NOT trigger sync when credential is already failed', async () => {
    setupArtifacts([]);
    mockGetCredentialHealthStatus.mockResolvedValue(FAILED);

    await renderPage();
    expect(mockSyncArtifactsAction).not.toHaveBeenCalled();
  });

  it('[P0] renders CredentialErrorBanner when credential health is already failed', async () => {
    setupArtifacts(ARTIFACTS);
    mockGetCredentialHealthStatus.mockResolvedValue(FAILED);

    const html = await renderPage();
    expect(html).toContain('CredentialErrorBanner');
  });

  it('[P1] renders credential error text when sync returns NO_CREDENTIAL', async () => {
    setupArtifacts([]);
    mockSyncArtifactsAction.mockResolvedValue({
      error: 'Credential missing',
      errorCode: 'NO_CREDENTIAL',
    });
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const html = await renderPage();
    expect(html).toContain('CredentialErrorBanner');
  });
});

describe('ProjectMapPage — page-load sync (Dev Notes strategy)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] triggers syncArtifactsAction when Postgres is empty', async () => {
    setupArtifacts([]);
    mockSyncArtifactsAction.mockResolvedValue({
      success: true,
      artifactsUpserted: 2,
      artifactsDeleted: 0,
    });
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce(ARTIFACTS);

    await renderPage();
    expect(mockSyncArtifactsAction).toHaveBeenCalled();
  });

  it('[P1] does NOT trigger sync on subsequent visits (populated Postgres)', async () => {
    setupArtifacts(ARTIFACTS);

    await renderPage();
    expect(mockSyncArtifactsAction).not.toHaveBeenCalled();
  });

  it('[P1] renders refreshed artifact titles after successful sync', async () => {
    setupArtifacts([]);
    mockSyncArtifactsAction.mockResolvedValue({
      success: true,
      artifactsUpserted: 2,
      artifactsDeleted: 0,
    });
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce(ARTIFACTS);

    const html = await renderPage();
    expect(html).toContain('bmad-easy PRD');
    expect(html).toContain('System Architecture');
  });

  it('[P1] falls back to original empty artifacts when sync fails', async () => {
    setupArtifacts([]);
    mockSyncArtifactsAction.mockResolvedValue({
      error: 'Unexpected error',
      errorCode: 'UNKNOWN',
    });
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const html = await renderPage();
    expect(html).toContain('Start your first conversation to create an artifact.');
  });
});

describe('ProjectMapPage — page structure (AC-1, UX-DR16)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the h1 "Project Map" for route-change focus management', async () => {
    setupArtifacts(ARTIFACTS);
    const html = await renderPage();
    expect(html).toContain('Project Map');
  });

  it('[P1] renders RefreshButton in the header', async () => {
    setupArtifacts(ARTIFACTS);
    const html = await renderPage();
    expect(html).toContain('RefreshButton');
  });
});

describe('ProjectMapPage — artifact data passed to ProjectMapArtifacts (AC-1, AC-2, Story 2.6)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] passes href={`/artifacts?id=${a.id}`} for each artifact to ProjectMapArtifacts', async () => {
    setupArtifacts(ARTIFACTS);
    const html = await renderPage();
    expect(html).toContain(
      'ProjectMapArtifacts:prd:bmad-easy PRD:completed:/artifacts?id=art_1|architecture:System Architecture:in-progress:/artifacts?id=art_2',
    );
  });
});
