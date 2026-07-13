/**
 * @jest-environment node
 *
 * ATDD — Story 2.5: View a Single Artifact's Rendered Content
 * Server Component unit tests for ArtifactsPage.
 * Covers AC-1 (two-column layout, rendered content), AC-2 (artifact load
 * error state), AC-3 (back navigation via query parameter approach).
 * Story 5.2 covers: AC-7 (breadcrumb inline beside title), AC-8 (header bottom divider).
 * Story 5.4 covers: AC-6 (list pane border-surface-raised).
 *
 * GREEN PHASE: implementation complete. Story 2.4 delivered the list-only
 * page; Story 2.5 adds searchParams handling, selected-artifact query,
 * two-column layout, and ArtifactViewer/ArtifactLoadError rendering.
 * Story 5.2 and Story 5.4 tests are active and passing.
 *
 * Child component rendering (ArtifactListEntry, ArtifactViewer,
 * ArtifactLoadError, CredentialErrorBanner) is verified by their own
 * co-located component tests. This page test focuses on data-fetching
 * decisions and layout structure. Child components are mocked as render
 * stubs to isolate the page test from their internal logic.
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
const mockArtifactFindFirst = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    repoConnection: { findUnique: mockFindUnique },
    artifact: { findMany: mockFindMany, findFirst: mockArtifactFindFirst },
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

jest.mock('@/components/artifact-browser/ArtifactListEntry', () => ({
  ArtifactListEntry: ({
    type,
    title,
    status,
    lastModifiedAt,
    href,
    selected,
  }: {
    type: string;
    title: string;
    status: string;
    lastModifiedAt: Date;
    href: string;
    selected?: boolean;
  }) =>
    `ArtifactListEntry:${type}:${title}:${status}:${lastModifiedAt.toISOString()}:${href}:${selected ?? false}`,
}));

jest.mock('@/components/artifact-browser/ArtifactViewer', () => ({
  ArtifactViewer: ({ content }: { content: string }) =>
    'ArtifactViewer:' + content,
}));

jest.mock('@/components/artifact-browser/ArtifactLoadError', () => ({
  ArtifactLoadError: () => 'ArtifactLoadError',
}));

jest.mock('@/components/project-map/CredentialErrorBanner', () => ({
  CredentialErrorBanner: () => 'CredentialErrorBanner',
}));

jest.mock('@/components/shell/Breadcrumb', () => ({
  Breadcrumb: () => 'Breadcrumb',
}));

import { renderToStaticMarkup } from 'react-dom/server';
import ArtifactsPage from './page';

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

const SELECTED_ARTIFACT = {
  id: 'art_1',
  type: 'prd',
  title: 'bmad-easy PRD',
  status: 'completed',
  lastModifiedAt: new Date('2026-06-14'),
  content: '---\ntitle: bmad-easy PRD\n---\n# PRD Body',
};

const HEALTHY = { success: true, status: 'healthy' as const };
const FAILED = { success: true, status: 'failed' as const };

function setupArtifacts(artifacts: typeof ARTIFACTS | []) {
  mockAuth.mockResolvedValue(SESSION);
  mockFindUnique.mockResolvedValue(REPO_CONNECTION);
  mockFindMany.mockResolvedValue(artifacts);
  mockGetCredentialHealthStatus.mockResolvedValue(HEALTHY);
}

async function renderPage(searchParams?: { id?: string }) {
  const element = await ArtifactsPage({
    searchParams: Promise.resolve(searchParams ?? {}),
  });
  return renderToStaticMarkup(element);
}

function setupSyncScenario(
  syncResult: Record<string, unknown>,
  finalArtifacts: typeof ARTIFACTS | [],
) {
  mockSyncArtifactsAction.mockResolvedValue(syncResult);
  mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce(finalArtifacts);
}

describe('ArtifactsPage — artifact list (AC-1, FR16, UX-DR12)', () => {
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

  it('[P0] selects only id on repoConnection.findUnique (NFR hardening)', async () => {
    setupArtifacts(ARTIFACTS);
    await renderPage();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: SESSION.userId },
      select: { id: true },
    });
  });

  it('[P0] renders artifact titles when Postgres has artifacts', async () => {
    setupArtifacts(ARTIFACTS);
    const html = await renderPage();
    expect(html).toContain('bmad-easy PRD');
    expect(html).toContain('System Architecture');
  });

  it('[P0] renders empty state when no artifacts and sync returns empty', async () => {
    setupArtifacts([]);
    setupSyncScenario(
      { success: true, artifactsUpserted: 0, artifactsDeleted: 0 },
      [],
    );

    const html = await renderPage();
    expect(html).toContain('Start your first conversation to create an artifact.');
  });
});

describe('ArtifactsPage — two-column layout (AC-1, Story 2.5)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders two-column layout when searchParams.id is present and artifact exists', async () => {
    setupArtifacts(ARTIFACTS);
    mockArtifactFindFirst.mockResolvedValue(SELECTED_ARTIFACT);

    const html = await renderPage({ id: 'art_1' });
    expect(html).toContain('w-[280px]');
    expect(html).toContain('ArtifactViewer:');
  });

  it('[P0] queries the selected artifact by id and repoConnectionId via findFirst (tenant isolation)', async () => {
    setupArtifacts(ARTIFACTS);
    mockArtifactFindFirst.mockResolvedValue(SELECTED_ARTIFACT);

    await renderPage({ id: 'art_1' });
    expect(mockArtifactFindFirst).toHaveBeenCalledWith({
      where: { id: 'art_1', repoConnectionId: REPO_CONNECTION.id },
      select: { content: true },
    });
  });

  it('[P0] passes the artifact content to ArtifactViewer', async () => {
    setupArtifacts(ARTIFACTS);
    mockArtifactFindFirst.mockResolvedValue(SELECTED_ARTIFACT);

    const html = await renderPage({ id: 'art_1' });
    expect(html).toContain('ArtifactViewer:---\ntitle: bmad-easy PRD\n---\n# PRD Body');
  });

  it('[P0] marks the selected entry with selected={true}', async () => {
    setupArtifacts(ARTIFACTS);
    mockArtifactFindFirst.mockResolvedValue(SELECTED_ARTIFACT);

    const html = await renderPage({ id: 'art_1' });
    expect(html).toContain('ArtifactListEntry:prd:bmad-easy PRD:completed:2026-06-14T00:00:00.000Z:/artifacts?id=art_1:true');
    expect(html).toContain('ArtifactListEntry:architecture:System Architecture:in-progress:2026-06-15T00:00:00.000Z:/artifacts?id=art_2:false');
  });

  it('[P0] renders ArtifactLoadError when searchParams.id is present but artifact not found (AC-2)', async () => {
    setupArtifacts(ARTIFACTS);
    mockArtifactFindFirst.mockResolvedValue(null);

    const html = await renderPage({ id: 'art_missing' });
    expect(html).toContain('ArtifactLoadError');
    expect(html).toContain('w-[280px]');
  });

  it('[P0] renders full-width list when no searchParams.id', async () => {
    setupArtifacts(ARTIFACTS);

    const html = await renderPage();
    expect(html).not.toContain('w-[280px]');
    expect(html).toContain('ArtifactListEntry:prd:bmad-easy PRD');
  });

  it('[P0] each ArtifactListEntry receives href={`/artifacts?id=${a.id}`}', async () => {
    setupArtifacts(ARTIFACTS);

    const html = await renderPage();
    expect(html).toContain('/artifacts?id=art_1');
    expect(html).toContain('/artifacts?id=art_2');
  });

  it('[P1] the selected artifact query is NOT run when no searchParams.id', async () => {
    setupArtifacts(ARTIFACTS);

    await renderPage();
    expect(mockArtifactFindFirst).not.toHaveBeenCalled();
  });

  it('[P1] the list query does NOT select content (only the findFirst does)', async () => {
    setupArtifacts(ARTIFACTS);
    mockArtifactFindFirst.mockResolvedValue(SELECTED_ARTIFACT);

    await renderPage({ id: 'art_1' });

    const findManyCall = mockFindMany.mock.calls[0][0];
    expect(findManyCall.select).not.toHaveProperty('content');

    const findFirstCall = mockArtifactFindFirst.mock.calls[0][0];
    expect(findFirstCall.select).toHaveProperty('content', true);
  });

  it('[P1] renders CredentialErrorBanner in the two-column layout when credential is failed', async () => {
    setupArtifacts(ARTIFACTS);
    mockGetCredentialHealthStatus.mockResolvedValue(FAILED);
    mockArtifactFindFirst.mockResolvedValue(SELECTED_ARTIFACT);

    const html = await renderPage({ id: 'art_1' });
    expect(html).toContain('CredentialErrorBanner');
    expect(html).toContain('w-[280px]');
  });

  it('[P1] sync-on-first-visit runs before findFirst when Postgres is empty and searchParams.id is present', async () => {
    setupArtifacts([]);
    setupSyncScenario(
      { success: true, artifactsUpserted: 2, artifactsDeleted: 0 },
      ARTIFACTS,
    );
    mockArtifactFindFirst.mockResolvedValue(SELECTED_ARTIFACT);

    await renderPage({ id: 'art_1' });

    expect(mockSyncArtifactsAction).toHaveBeenCalled();
    expect(mockArtifactFindFirst).toHaveBeenCalled();
    const syncCallOrder = mockSyncArtifactsAction.mock.invocationCallOrder[0];
    const findFirstCallOrder = mockArtifactFindFirst.mock.invocationCallOrder[0];
    expect(syncCallOrder).toBeLessThan(findFirstCallOrder);
  });
});

describe('ArtifactsPage — credential error banner (AC-3, UX-DR10)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] calls getCredentialHealthStatus to check credential health', async () => {
    setupArtifacts(ARTIFACTS);
    await renderPage();
    expect(mockGetCredentialHealthStatus).toHaveBeenCalled();
  });

  it('[P0] renders CredentialErrorBanner when credential health is failed', async () => {
    setupArtifacts(ARTIFACTS);
    mockGetCredentialHealthStatus.mockResolvedValue(FAILED);

    const html = await renderPage();
    expect(html).toContain('CredentialErrorBanner');
  });

  it('[P0] does NOT trigger sync when credential is already failed', async () => {
    setupArtifacts([]);
    mockGetCredentialHealthStatus.mockResolvedValue(FAILED);

    await renderPage();
    expect(mockSyncArtifactsAction).not.toHaveBeenCalled();
  });

  it('[P1] renders CredentialErrorBanner when sync returns NO_CREDENTIAL', async () => {
    setupArtifacts([]);
    setupSyncScenario(
      { error: 'Credential missing', errorCode: 'NO_CREDENTIAL' },
      [],
    );

    const html = await renderPage();
    expect(html).toContain('CredentialErrorBanner');
  });
});

describe('ArtifactsPage — page-load sync (Dev Notes strategy)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] triggers syncArtifactsAction when Postgres is empty', async () => {
    setupArtifacts([]);
    setupSyncScenario(
      { success: true, artifactsUpserted: 2, artifactsDeleted: 0 },
      ARTIFACTS,
    );

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
    setupSyncScenario(
      { success: true, artifactsUpserted: 2, artifactsDeleted: 0 },
      ARTIFACTS,
    );

    const html = await renderPage();
    expect(html).toContain('bmad-easy PRD');
    expect(html).toContain('System Architecture');
  });

  it('[P1] falls back to empty state when sync returns UNKNOWN error', async () => {
    setupArtifacts([]);
    setupSyncScenario(
      { error: 'Unexpected error', errorCode: 'UNKNOWN' },
      [],
    );

    const html = await renderPage();
    expect(html).toContain('Start your first conversation to create an artifact.');
  });
});

describe('ArtifactsPage — page structure (AC-1, UX-DR16)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the h1 "Artifact Browser" for route-change focus management', async () => {
    setupArtifacts(ARTIFACTS);
    const html = await renderPage();
    expect(html).toContain('Artifact Browser');
  });

  it('[P0] renders Breadcrumb', async () => {
    setupArtifacts(ARTIFACTS);
    const html = await renderPage();
    expect(html).toContain('Breadcrumb');
  });

  describe('[P0] Story 5.2 — Header structure (AC-7, AC-8)', () => {
    it('header has border-b border-surface-raised (AC-8 divider)', async () => {
      setupArtifacts(ARTIFACTS);
      const html = await renderPage();
      expect(html).toContain('border-b');
      expect(html).toContain('border-surface-raised');
    });

    it('header has pt-6 pb-4 px-8 padding (AC-7 header padding)', async () => {
      setupArtifacts(ARTIFACTS);
      const html = await renderPage();
      expect(html).toContain('pt-6');
      expect(html).toContain('pb-4');
      expect(html).toContain('px-8');
    });

    it('breadcrumb and h1 are in a flex items-center gap-3 row (AC-7 inline)', async () => {
      setupArtifacts(ARTIFACTS);
      const html = await renderPage();
      expect(html).toContain('flex items-center gap-3');
    });

    it('h1 does NOT have px-8 (padding moved to header) (AC-7)', async () => {
      setupArtifacts(ARTIFACTS);
      const html = await renderPage();
      const h1Match = html.match(/<h1[^>]*>/);
      expect(h1Match).not.toBeNull();
      expect(h1Match![0]).not.toContain('px-8');
    });
  });

  // ─── Story 5.4: Hairline border token (AC-6) ───────────────────────────────
  //
  // Story 5.4: AC-6: Artifact list pane divider uses border-surface-raised (not border-border-subtle).
  // Test is active (GREEN) after Story 5.4 implementation.

  describe('[P0] Story 5.4, AC-6 — Artifact list pane border token', () => {
    it('list pane divider uses border-surface-raised, not border-border-subtle (AC-6)', async () => {
      setupArtifacts(ARTIFACTS);
      mockArtifactFindFirst.mockResolvedValue(SELECTED_ARTIFACT);
      const html = await renderPage({ id: 'art_1' });
      expect(html).toContain('border-surface-raised');
      expect(html).not.toContain('border-border-subtle');
    });
  });

  // ─── Story 5.4: Scrollbar hiding (AC-7) ────────────────────────────────────
  //
  // Story 5.4: AC-7: Scrollable artifact list pane hides scrollbars via no-scrollbar.
  // Test is active (GREEN) after Story 5.4 implementation.

  describe('[P0] Story 5.4, AC-7 — Scrollbar hiding on artifact list pane', () => {
    it('artifact list pane has no-scrollbar class (AC-7)', async () => {
      setupArtifacts(ARTIFACTS);
      mockArtifactFindFirst.mockResolvedValue(SELECTED_ARTIFACT);
      const html = await renderPage({ id: 'art_1' });
      expect(html).toContain('no-scrollbar');
    });
  });
});
