/**
 * @jest-environment node
 *
 * Story 2.1: Mirror Repository Artifacts into Postgres
 * Unit tests for syncArtifactsAction (Server Action wrapper).
 *
 * Covers Task 6.13:
 * - Session resolution (auth)
 * - Token resolution (resolveOAuthToken)
 * - Repo connection lookup (getPrisma().repoConnection.findUnique)
 * - syncArtifacts delegation with correct args
 * - CredentialFailureError → NO_CREDENTIAL + markCredentialFailed
 * - RateLimitError → RATE_LIMITED
 * - Missing repo connection → NO_REPO_CONNECTION
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockResolveOAuthToken = jest.fn();
const mockMarkCredentialFailed = jest.fn();

class CredentialFailureError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Credential failure: GitHub API returned ${statusCode}`);
    this.name = 'CredentialFailureError';
  }
}

jest.mock('@/lib/credential-health', () => ({
  resolveOAuthToken: (...args: unknown[]) => mockResolveOAuthToken(...args),
  markCredentialFailed: (...args: unknown[]) => mockMarkCredentialFailed(...args),
  CredentialFailureError,
}));

const mockSyncArtifacts = jest.fn();
jest.mock('@/lib/artifacts', () => ({
  syncArtifacts: (...args: unknown[]) => mockSyncArtifacts(...args),
}));

const mockFindUniqueRepoConnection = jest.fn();
const mockUpdateManyRepoConnection = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    repoConnection: {
      findUnique: mockFindUniqueRepoConnection,
      updateMany: mockUpdateManyRepoConnection,
    },
  }),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { syncArtifactsAction } from './artifacts.actions';
import { RateLimitError as RealRateLimitError } from '@/lib/repository-validation';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION = { userId: 'usr_abc123' };
const DECRYPTED_TOKEN = 'gho_real_token';
const REPO_CONNECTION = {
  id: 'repo_conn_1',
  userId: 'usr_abc123',
  repoUrl: 'https://github.com/my-org/my-repo',
  lastSyncedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockResolveOAuthToken.mockResolvedValue(DECRYPTED_TOKEN);
  mockFindUniqueRepoConnection.mockResolvedValue(REPO_CONNECTION);
  mockUpdateManyRepoConnection.mockResolvedValue({ count: 1 });
  mockMarkCredentialFailed.mockResolvedValue(undefined);
  mockSyncArtifacts.mockResolvedValue({ success: true, artifactsUpserted: 0, artifactsDeleted: 0 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('syncArtifactsAction — happy path', () => {
  it('[P0] resolves session, token, repo connection and delegates to syncArtifacts with correct args', async () => {
    await syncArtifactsAction();

    expect(mockAuth).toHaveBeenCalled();
    expect(mockFindUniqueRepoConnection).toHaveBeenCalledWith({ where: { userId: SESSION.userId }, select: { id: true, repoUrl: true } });
    expect(mockResolveOAuthToken).toHaveBeenCalledWith(SESSION.userId);
    expect(mockSyncArtifacts).toHaveBeenCalledWith(
      DECRYPTED_TOKEN,
      'my-org',
      'my-repo',
      REPO_CONNECTION.id,
    );
  });

  it('[P0] returns the syncArtifacts result on success', async () => {
    mockSyncArtifacts.mockResolvedValue({ success: true, artifactsUpserted: 5, artifactsDeleted: 1 });

    const result = await syncArtifactsAction();

    expect(result).toEqual({ success: true, artifactsUpserted: 5, artifactsDeleted: 1 });
  });

  it('[P0] strips .git suffix from repo URL when parsing owner/repo', async () => {
    mockFindUniqueRepoConnection.mockResolvedValue({
      ...REPO_CONNECTION,
      repoUrl: 'https://github.com/my-org/my-repo.git',
    });

    await syncArtifactsAction();

    expect(mockSyncArtifacts).toHaveBeenCalledWith(
      DECRYPTED_TOKEN,
      'my-org',
      'my-repo',
      REPO_CONNECTION.id,
    );
  });

  it('[P0] strips trailing slash from repo URL when parsing owner/repo', async () => {
    mockFindUniqueRepoConnection.mockResolvedValue({
      ...REPO_CONNECTION,
      repoUrl: 'https://github.com/my-org/my-repo/',
    });

    await syncArtifactsAction();

    expect(mockSyncArtifacts).toHaveBeenCalledWith(
      DECRYPTED_TOKEN,
      'my-org',
      'my-repo',
      REPO_CONNECTION.id,
    );
  });
});

// ─── Missing session ──────────────────────────────────────────────────────────

describe('syncArtifactsAction — missing session', () => {
  it('[P0] returns NO_CREDENTIAL when session is missing', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await syncArtifactsAction();

    expect(result).toMatchObject({ errorCode: 'NO_CREDENTIAL' });
    expect(mockSyncArtifacts).not.toHaveBeenCalled();
  });
});

// ─── Missing repo connection ──────────────────────────────────────────────────

describe('syncArtifactsAction — missing repo connection', () => {
  it('[P0] returns NO_REPO_CONNECTION when no RepoConnection exists for the user', async () => {
    mockFindUniqueRepoConnection.mockResolvedValue(null);

    const result = await syncArtifactsAction();

    expect(result).toMatchObject({ errorCode: 'NO_REPO_CONNECTION' });
    expect(mockSyncArtifacts).not.toHaveBeenCalled();
  });
});

// ─── Credential failure from resolveOAuthToken ───────────────────────────────

describe('syncArtifactsAction — credential failure from resolveOAuthToken', () => {
  it('[P0] returns NO_CREDENTIAL and calls markCredentialFailed when resolveOAuthToken throws CredentialFailureError', async () => {
    mockResolveOAuthToken.mockRejectedValue(new CredentialFailureError(401));

    const result = await syncArtifactsAction();

    expect(result).toMatchObject({ errorCode: 'NO_CREDENTIAL' });
    expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId, expect.any(Date));
    expect(mockSyncArtifacts).not.toHaveBeenCalled();
  });

  it('[P1] returns UNKNOWN when resolveOAuthToken throws a non-CredentialFailureError', async () => {
    mockResolveOAuthToken.mockRejectedValue(new Error('Decryption failed: invalid auth tag'));

    const result = await syncArtifactsAction();

    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
    expect(mockSyncArtifacts).not.toHaveBeenCalled();
  });
});

// ─── Errors from syncArtifacts ────────────────────────────────────────────────

describe('syncArtifactsAction — errors from syncArtifacts', () => {
  it('[P0] returns RATE_LIMITED when syncArtifacts throws RateLimitError', async () => {
    mockSyncArtifacts.mockRejectedValue(new RealRateLimitError('Rate limited', 60));

    const result = await syncArtifactsAction();

    expect(result).toMatchObject({ errorCode: 'RATE_LIMITED' });
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
  });

  it('[P0] returns NO_CREDENTIAL and calls markCredentialFailed when syncArtifacts throws CredentialFailureError', async () => {
    mockSyncArtifacts.mockRejectedValue(new CredentialFailureError(401));

    const result = await syncArtifactsAction();

    expect(result).toMatchObject({ errorCode: 'NO_CREDENTIAL' });
    expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId, expect.any(Date));
  });

  it('[P1] returns UNKNOWN when syncArtifacts throws an unexpected error', async () => {
    mockSyncArtifacts.mockRejectedValue(new Error('GitHub API 500'));

    const result = await syncArtifactsAction();

    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });
});

// ─── Invalid repo URL ─────────────────────────────────────────────────────────

describe('syncArtifactsAction — invalid repo URL', () => {
  it('[P1] returns UNKNOWN when repoUrl does not match GitHub URL pattern', async () => {
    mockFindUniqueRepoConnection.mockResolvedValue({
      ...REPO_CONNECTION,
      repoUrl: 'https://gitlab.com/owner/repo',
    });

    const result = await syncArtifactsAction();

    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
    expect(mockSyncArtifacts).not.toHaveBeenCalled();
  });
});

// ─── Cooldown (per-user rate limiting) ───────────────────────────────────────

describe('syncArtifactsAction — cooldown', () => {
  it('[P0] returns RATE_LIMITED when cooldown is active (lastSyncedAt within 30s)', async () => {
    mockUpdateManyRepoConnection.mockResolvedValue({ count: 0 });

    const result = await syncArtifactsAction();

    expect(result).toMatchObject({ errorCode: 'RATE_LIMITED' });
    expect(mockSyncArtifacts).not.toHaveBeenCalled();
    expect(mockResolveOAuthToken).not.toHaveBeenCalled();
  });

  it('[P0] allows sync when lastSyncedAt is null (first sync)', async () => {
    mockFindUniqueRepoConnection.mockResolvedValue({ ...REPO_CONNECTION, lastSyncedAt: null });
    mockUpdateManyRepoConnection.mockResolvedValue({ count: 1 });

    const result = await syncArtifactsAction();

    expect(result).toEqual({ success: true, artifactsUpserted: 0, artifactsDeleted: 0 });
    expect(mockSyncArtifacts).toHaveBeenCalled();
  });

  it('[P1] allows sync when lastSyncedAt is older than 30s', async () => {
    const oldDate = new Date(Date.now() - 60_000);
    mockFindUniqueRepoConnection.mockResolvedValue({ ...REPO_CONNECTION, lastSyncedAt: oldDate });
    mockUpdateManyRepoConnection.mockResolvedValue({ count: 1 });

    const result = await syncArtifactsAction();

    expect(result).toEqual({ success: true, artifactsUpserted: 0, artifactsDeleted: 0 });
    expect(mockSyncArtifacts).toHaveBeenCalled();
  });

  it('[P0] updates lastSyncedAt atomically before resolving token', async () => {
    await syncArtifactsAction();

    expect(mockUpdateManyRepoConnection).toHaveBeenCalledWith({
      where: {
        id: REPO_CONNECTION.id,
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: expect.any(Date) } }],
      },
      data: { lastSyncedAt: expect.any(Date) },
    });
    const updateManyCallOrder = mockUpdateManyRepoConnection.mock.invocationCallOrder[0];
    const resolveTokenCallOrder = mockResolveOAuthToken.mock.invocationCallOrder[0];
    expect(updateManyCallOrder).toBeLessThan(resolveTokenCallOrder);
  });
});

// ─── Token never returned ─────────────────────────────────────────────────────

describe('syncArtifactsAction — security', () => {
  it('[P0] decrypted access token is NEVER returned to the client', async () => {
    const result = await syncArtifactsAction();

    expect(JSON.stringify(result)).not.toContain(DECRYPTED_TOKEN);
  });
});
