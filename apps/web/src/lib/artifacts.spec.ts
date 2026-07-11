/**
 * @jest-environment node
 *
 * Story 2.1: Mirror Repository Artifacts into Postgres
 * Unit tests for syncArtifacts (core mirroring logic).
 *
 * Covers:
 * - AC-1: Page-load / manual-refresh mirroring (happy path)
 * - AC-4: Empty / missing _bmad-output/
 * - AC-5: Stale artifact cleanup
 * - AC-6: Credential failure handling (401)
 * - AC-7: Rate-limit and 403 handling
 * - Type derivation, title extraction, non-.md skipping, recursive scanning
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

class CredentialFailureError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Credential failure: GitHub API returned ${statusCode}`);
    this.name = 'CredentialFailureError';
  }
}

jest.mock('@/lib/credential-health', () => ({
  CredentialFailureError,
}));

jest.mock('@/lib/prisma', () => ({
  getPrisma: jest.fn(),
}));

const mockGetPrisma = jest.fn();
const mockArtifactUpsert = jest.fn();
const mockArtifactDeleteMany = jest.fn();
const mockTransaction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  clearGithubCache();
  mockArtifactUpsert.mockResolvedValue({ id: 'art_1' });
  mockArtifactDeleteMany.mockResolvedValue({ count: 0 });
  const prismaClient = {
    artifact: {
      upsert: mockArtifactUpsert,
      deleteMany: mockArtifactDeleteMany,
    },
    $transaction: mockTransaction,
  };
  mockTransaction.mockImplementation(async (fn: (tx: typeof prismaClient) => Promise<unknown>) =>
    fn(prismaClient),
  );
  mockGetPrisma.mockReturnValue(prismaClient);
  const { getPrisma } = require('@/lib/prisma');
  (getPrisma as jest.Mock).mockImplementation(mockGetPrisma);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Test utilities ───────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'gho_real_token';
const OWNER = 'my-org';
const REPO = 'my-repo';
const REPO_CONNECTION_ID = 'repo_conn_1';
const CONTENTS_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
const COMMITS_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/commits`;

function mockHeaders(entries: Record<string, string> = {}): { get(name: string): string | null } {
  const lower = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

function githubDirListing(
  entries: Array<{ name: string; type: string }>,
  headers: Record<string, string> = {},
) {
  return {
    ok: true,
    status: 200,
    json: async () => entries,
    headers: mockHeaders(headers),
  };
}

function githubFileContent(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      type: 'file',
      encoding: 'base64',
      content: Buffer.from(content).toString('base64'),
    }),
    headers: mockHeaders(),
  };
}

function github404() {
  return {
    ok: false,
    status: 404,
    json: async () => ({ message: 'Not Found' }),
    headers: mockHeaders(),
  };
}

function github401() {
  return {
    ok: false,
    status: 401,
    json: async () => ({ message: 'Bad credentials' }),
    headers: mockHeaders(),
  };
}

function github403PrimaryRateLimit() {
  return {
    ok: false,
    status: 403,
    json: async () => ({ message: 'API rate limit exceeded for user ID 123.' }),
    headers: mockHeaders({ 'X-RateLimit-Remaining': '0' }),
  };
}

function github403NoRateLimit() {
  return {
    ok: false,
    status: 403,
    json: async () => ({ message: 'Resource not accessible by integration' }),
    headers: mockHeaders(),
  };
}

function githubCommit(dateStr: string) {
  return {
    ok: true,
    status: 200,
    json: async () => [{ commit: { committer: { date: dateStr } } }],
    headers: mockHeaders(),
  };
}

// ─── Subject under test ───────────────────────────────────────────────────────

import { syncArtifacts } from './artifacts';
import { RateLimitError, clearGithubCache } from './repository-validation';

// ─── AC-1: Happy path (Task 6.2) ─────────────────────────────────────────────

describe('syncArtifacts — AC-1 happy path', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  it('[P0] upserts 3 .md files with correct type, title, status, lastModifiedAt, content, repoConnectionId', async () => {
    const rootListing = githubDirListing([
      { name: 'brainstorming', type: 'dir' },
      { name: 'planning-artifacts', type: 'dir' },
    ]);
    const brainstormingListing = githubDirListing([
      { name: 'session-1.md', type: 'file' },
    ]);
    const planningListing = githubDirListing([
      { name: 'architecture.md', type: 'file' },
      { name: 'no-title.md', type: 'file' },
    ]);

    const fileWithFrontmatterTitle = '---\ntitle: "Brainstorm Session 1"\n---\n# Body';
    const fileWithHeadingTitle = '# Architecture Document\n\nSome content';
    const fileWithNoTitle = 'Just some markdown content without a heading';

    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`) return Promise.resolve(rootListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/brainstorming`)
        return Promise.resolve(brainstormingListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/planning-artifacts`)
        return Promise.resolve(planningListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/brainstorming/session-1.md`)
        return Promise.resolve(githubFileContent(fileWithFrontmatterTitle));
      if (url === `${CONTENTS_BASE}/_bmad-output/planning-artifacts/architecture.md`)
        return Promise.resolve(githubFileContent(fileWithHeadingTitle));
      if (url === `${CONTENTS_BASE}/_bmad-output/planning-artifacts/no-title.md`)
        return Promise.resolve(githubFileContent(fileWithNoTitle));
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    const result = await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);

    expect(result).toEqual({ success: true, artifactsUpserted: 3, artifactsDeleted: 0 });
    expect(mockArtifactUpsert).toHaveBeenCalledTimes(3);

    const calls = mockArtifactUpsert.mock.calls;
    const upsertedPaths = calls.map((c) => c[0].where.repoConnectionId_path.path);
    expect(upsertedPaths).toEqual(
      expect.arrayContaining([
        'brainstorming/session-1.md',
        'planning-artifacts/architecture.md',
        'planning-artifacts/no-title.md',
      ]),
    );

    const brainstormCall = calls.find(
      (c) => c[0].where.repoConnectionId_path.path === 'brainstorming/session-1.md',
    );
    expect(brainstormCall[0].create).toMatchObject({
      repoConnectionId: REPO_CONNECTION_ID,
      path: 'brainstorming/session-1.md',
      type: 'brainstorming',
      title: 'Brainstorm Session 1',
      status: 'completed',
      content: fileWithFrontmatterTitle,
    });

    const archCall = calls.find(
      (c) => c[0].where.repoConnectionId_path.path === 'planning-artifacts/architecture.md',
    );
    expect(archCall[0].create).toMatchObject({
      type: 'architecture',
      title: 'Architecture Document',
      status: 'completed',
    });

    const noTitleCall = calls.find(
      (c) => c[0].where.repoConnectionId_path.path === 'planning-artifacts/no-title.md',
    );
    expect(noTitleCall[0].create).toMatchObject({
      type: 'other',
      title: 'no-title',
      status: 'completed',
    });
  });
});

// ─── AC-5: Stale cleanup (Task 6.3) ──────────────────────────────────────────

describe('syncArtifacts — AC-5 stale artifact cleanup', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
    mockArtifactDeleteMany.mockResolvedValue({ count: 1 });
  });

  it('[P0] deletes artifacts whose path is not in the scanned set after a successful scan', async () => {
    const rootListing = githubDirListing([
      { name: 'current.md', type: 'file' },
    ]);

    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`) return Promise.resolve(rootListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/current.md`)
        return Promise.resolve(githubFileContent('# Current'));
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    const result = await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);

    expect(result).toEqual({ success: true, artifactsUpserted: 1, artifactsDeleted: 1 });
    expect(mockArtifactDeleteMany).toHaveBeenCalledWith({
      where: {
        repoConnectionId: REPO_CONNECTION_ID,
        path: { notIn: ['current.md'] },
      },
    });
  });
});

// ─── AC-4: Empty _bmad-output/ (Task 6.4) ─────────────────────────────────────

describe('syncArtifacts — AC-4 empty _bmad-output/', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
    mockArtifactDeleteMany.mockResolvedValue({ count: 2 });
  });

  it('[P0] returns 0 upserts and deletes existing artifacts when _bmad-output/ is empty', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`)
        return Promise.resolve(githubDirListing([]));
      return Promise.resolve(github404());
    });

    const result = await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);

    expect(result).toEqual({ success: true, artifactsUpserted: 0, artifactsDeleted: 2 });
    expect(mockArtifactUpsert).not.toHaveBeenCalled();
    expect(mockArtifactDeleteMany).toHaveBeenCalledWith({
      where: { repoConnectionId: REPO_CONNECTION_ID, path: { notIn: [] } },
    });
  });
});

// ─── AC-4: Missing _bmad-output/ (404) (Task 6.5) ─────────────────────────────

describe('syncArtifacts — AC-4 missing _bmad-output/ (404)', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
    mockArtifactDeleteMany.mockResolvedValue({ count: 3 });
  });

  it('[P0] returns NOT_FOUND error when _bmad-output/ is 404 or inaccessible', async () => {
    mockFetch.mockResolvedValue(github404());

    const result = await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);

    expect(result).toEqual({
      error: expect.any(String),
      errorCode: 'NOT_FOUND',
    });
    expect(mockArtifactUpsert).not.toHaveBeenCalled();
    expect(mockArtifactDeleteMany).not.toHaveBeenCalled();
  });
});

// ─── AC-6: Credential failure (Task 6.6) ─────────────────────────────────────

describe('syncArtifacts — AC-6 credential failure (401)', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  it('[P0] throws CredentialFailureError when GitHub returns 401 for _bmad-output/ root', async () => {
    mockFetch.mockResolvedValue(github401());

    await expect(
      syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID),
    ).rejects.toThrow(CredentialFailureError);
  });

  it('[P0] throws CredentialFailureError when 401 occurs during file content fetch', async () => {
    const rootListing = githubDirListing([{ name: 'doc.md', type: 'file' }]);

    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`) return Promise.resolve(rootListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/doc.md`) return Promise.resolve(github401());
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    await expect(
      syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID),
    ).rejects.toThrow(CredentialFailureError);
  });
});

// ─── AC-7: Rate limit (Task 6.7) ─────────────────────────────────────────────

describe('syncArtifacts — AC-7 rate limit (403 primary)', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  it('[P0] throws RateLimitError when GitHub returns 403 with X-RateLimit-Remaining: 0', async () => {
    mockFetch.mockResolvedValue(github403PrimaryRateLimit());

    await expect(
      syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID),
    ).rejects.toThrow(RateLimitError);
  });
});

// ─── AC-7: Non-rate-limit 403 (Task 6.8) ──────────────────────────────────────

describe('syncArtifacts — AC-7 non-rate-limit 403', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  it('[P1] skips a subdirectory that returns non-rate-limit 403 and still scans other artifacts', async () => {
    const rootListing = githubDirListing([
      { name: 'accessible', type: 'dir' },
      { name: 'inaccessible', type: 'dir' },
    ]);
    const accessibleListing = githubDirListing([{ name: 'doc.md', type: 'file' }]);

    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`) return Promise.resolve(rootListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/accessible`)
        return Promise.resolve(accessibleListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/inaccessible`)
        return Promise.resolve(github403NoRateLimit());
      if (url === `${CONTENTS_BASE}/_bmad-output/accessible/doc.md`)
        return Promise.resolve(githubFileContent('# Accessible Doc'));
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    const result = await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);

    expect(result).toEqual({ success: true, artifactsUpserted: 1, artifactsDeleted: 0 });
    expect(mockArtifactUpsert).toHaveBeenCalledTimes(1);
    const upsertedPath = mockArtifactUpsert.mock.calls[0][0].where.repoConnectionId_path.path;
    expect(upsertedPath).toBe('accessible/doc.md');
  });
});

// ─── Type derivation (Task 6.9) ──────────────────────────────────────────────

describe('syncArtifacts — type derivation (Task 6.9)', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  const typeCases: Array<{ path: string; expectedType: string; description: string }> = [
    { path: 'brainstorming/session.md', expectedType: 'brainstorming', description: 'brainstorming/' },
    { path: 'planning-artifacts/prds/prd.md', expectedType: 'prd', description: 'planning-artifacts/prds/' },
    { path: 'planning-artifacts/architecture.md', expectedType: 'architecture', description: 'planning-artifacts/architecture*' },
    { path: 'planning-artifacts/epics.md', expectedType: 'epics', description: 'planning-artifacts/epics*' },
    { path: 'planning-artifacts/ux-designs/design.md', expectedType: 'ux', description: 'planning-artifacts/ux-designs/' },
    { path: 'planning-artifacts/research/technical-foo.md', expectedType: 'technical-research', description: 'technical-* filename' },
    { path: 'planning-artifacts/research/market-foo.md', expectedType: 'market-research', description: 'market-* filename' },
    { path: 'planning-artifacts/research/domain-foo.md', expectedType: 'domain-research', description: 'domain-* filename' },
    { path: 'planning-artifacts/research/other-foo.md', expectedType: 'other', description: 'research/ with unknown prefix' },
    { path: 'planning-artifacts/briefs/brief.md', expectedType: 'product-brief', description: 'planning-artifacts/briefs/' },
    { path: 'planning-artifacts/prfaq/faq.md', expectedType: 'prfaq', description: 'planning-artifacts/prfaq/' },
    { path: 'implementation-artifacts/story.md', expectedType: 'epics', description: 'implementation-artifacts/' },
    { path: 'test-artifacts/plan.md', expectedType: 'test-arch', description: 'test-artifacts/' },
    { path: 'random/path.md', expectedType: 'other', description: 'unknown path' },
  ];

  for (const { path, expectedType, description } of typeCases) {
    it(`[P1] derives type "${expectedType}" for ${description}`, async () => {
      const segments = path.split('/');
      const dirListings: Record<string, Array<{ name: string; type: string }>> = {};
      let currentPath = '_bmad-output';
      for (let i = 0; i < segments.length - 1; i++) {
        dirListings[currentPath] = [{ name: segments[i], type: 'dir' }];
        currentPath = `${currentPath}/${segments[i]}`;
      }
      dirListings[currentPath] = [{ name: segments[segments.length - 1], type: 'file' }];

      mockFetch.mockImplementation((url: string) => {
        for (const [dirPath, entries] of Object.entries(dirListings)) {
          if (url === `${CONTENTS_BASE}/${dirPath}`) return Promise.resolve(githubDirListing(entries));
        }
        if (url === `${CONTENTS_BASE}/_bmad-output/${path}`)
          return Promise.resolve(githubFileContent('# Title'));
        if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
        return Promise.resolve(github404());
      });

      await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);

      expect(mockArtifactUpsert).toHaveBeenCalledTimes(1);
      expect(mockArtifactUpsert.mock.calls[0][0].create.type).toBe(expectedType);
    });
  }
});

// ─── Title extraction (Task 6.10) ─────────────────────────────────────────────

describe('syncArtifacts — title extraction (Task 6.10)', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  it('[P1] uses frontmatter title when present', async () => {
    const content = '---\ntitle: "My PRD"\n---\n# Heading';
    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`)
        return Promise.resolve(githubDirListing([{ name: 'doc.md', type: 'file' }]));
      if (url === `${CONTENTS_BASE}/_bmad-output/doc.md`)
        return Promise.resolve(githubFileContent(content));
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);
    expect(mockArtifactUpsert.mock.calls[0][0].create.title).toBe('My PRD');
  });

  it('[P1] falls back to first # Heading when no frontmatter title', async () => {
    const content = '# My Heading\n\nSome body text';
    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`)
        return Promise.resolve(githubDirListing([{ name: 'doc.md', type: 'file' }]));
      if (url === `${CONTENTS_BASE}/_bmad-output/doc.md`)
        return Promise.resolve(githubFileContent(content));
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);
    expect(mockArtifactUpsert.mock.calls[0][0].create.title).toBe('My Heading');
  });

  it('[P1] falls back to path-derived title when no frontmatter or heading', async () => {
    const content = 'Just some plain text without a heading';
    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`)
        return Promise.resolve(githubDirListing([{ name: 'my-doc.md', type: 'file' }]));
      if (url === `${CONTENTS_BASE}/_bmad-output/my-doc.md`)
        return Promise.resolve(githubFileContent(content));
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);
    expect(mockArtifactUpsert.mock.calls[0][0].create.title).toBe('my-doc');
  });
});

// ─── Non-.md files skipped (Task 6.11) ────────────────────────────────────────

describe('syncArtifacts — non-.md files skipped (Task 6.11)', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  it('[P1] upserts only .md files, skipping .yaml, .json, .html', async () => {
    const rootListing = githubDirListing([
      { name: 'doc.md', type: 'file' },
      { name: 'config.yaml', type: 'file' },
      { name: 'data.json', type: 'file' },
      { name: 'page.html', type: 'file' },
      { name: 'readme.txt', type: 'file' },
    ]);

    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`) return Promise.resolve(rootListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/doc.md`)
        return Promise.resolve(githubFileContent('# Doc'));
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    const result = await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);

    expect(result).toEqual({ success: true, artifactsUpserted: 1, artifactsDeleted: 0 });
    expect(mockArtifactUpsert).toHaveBeenCalledTimes(1);
    expect(mockArtifactUpsert.mock.calls[0][0].where.repoConnectionId_path.path).toBe('doc.md');
  });
});

// ─── Recursive scanning (Task 6.12) ───────────────────────────────────────────

describe('syncArtifacts — recursive scanning (Task 6.12)', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  it('[P1] scans .md files at all levels of nested subdirectories (3 levels deep)', async () => {
    const rootListing = githubDirListing([{ name: 'level1', type: 'dir' }]);
    const level1Listing = githubDirListing([
      { name: 'doc1.md', type: 'file' },
      { name: 'level2', type: 'dir' },
    ]);
    const level2Listing = githubDirListing([
      { name: 'doc2.md', type: 'file' },
      { name: 'level3', type: 'dir' },
    ]);
    const level3Listing = githubDirListing([{ name: 'doc3.md', type: 'file' }]);

    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`) return Promise.resolve(rootListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/level1`) return Promise.resolve(level1Listing);
      if (url === `${CONTENTS_BASE}/_bmad-output/level1/level2`)
        return Promise.resolve(level2Listing);
      if (url === `${CONTENTS_BASE}/_bmad-output/level1/level2/level3`)
        return Promise.resolve(level3Listing);
      if (url === `${CONTENTS_BASE}/_bmad-output/level1/doc1.md`)
        return Promise.resolve(githubFileContent('# Doc 1'));
      if (url === `${CONTENTS_BASE}/_bmad-output/level1/level2/doc2.md`)
        return Promise.resolve(githubFileContent('# Doc 2'));
      if (url === `${CONTENTS_BASE}/_bmad-output/level1/level2/level3/doc3.md`)
        return Promise.resolve(githubFileContent('# Doc 3'));
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    const result = await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);

    expect(result).toEqual({ success: true, artifactsUpserted: 3, artifactsDeleted: 0 });
    const upsertedPaths = mockArtifactUpsert.mock.calls.map(
      (c) => c[0].where.repoConnectionId_path.path,
    );
    expect(upsertedPaths).toEqual(
      expect.arrayContaining([
        'level1/doc1.md',
        'level1/level2/doc2.md',
        'level1/level2/level3/doc3.md',
      ]),
    );
  });
});

// ─── project-context.md skipped ───────────────────────────────────────────────

describe('syncArtifacts — project-context.md skipped at root', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  it('[P1] does not upsert project-context.md at _bmad-output/ root', async () => {
    const rootListing = githubDirListing([
      { name: 'project-context.md', type: 'file' },
      { name: 'real-artifact.md', type: 'file' },
    ]);

    mockFetch.mockImplementation((url: string) => {
      if (url === `${CONTENTS_BASE}/_bmad-output`) return Promise.resolve(rootListing);
      if (url === `${CONTENTS_BASE}/_bmad-output/real-artifact.md`)
        return Promise.resolve(githubFileContent('# Real'));
      if (url.startsWith(COMMITS_BASE)) return Promise.resolve(githubCommit('2026-07-01T10:00:00Z'));
      return Promise.resolve(github404());
    });

    const result = await syncArtifacts(ACCESS_TOKEN, OWNER, REPO, REPO_CONNECTION_ID);

    expect(result.artifactsUpserted).toBe(1);
    expect(mockArtifactUpsert.mock.calls[0][0].where.repoConnectionId_path.path).toBe(
      'real-artifact.md',
    );
  });
});
