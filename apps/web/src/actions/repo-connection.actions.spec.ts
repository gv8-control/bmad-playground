/**
 * @jest-environment node
 *
 * ATDD — Story 1.3: Connect a Repository by URL
 * Integration tests for the connectRepository Server Action.
 * Covers AC-2 (URL validation + write-access check), AC-3 (encrypted storage,
 * token never returned to client), AC-4 (descriptive per-cause error messages).
 *
 * RED PHASE: all tests are skipped until repo-connection.actions.ts is created (Task 4).
 * Remove test.skip() one describe-block at a time as you implement each task.
 *
 * Module will not resolve until Task 4.1 creates the actions file — that
 * "Cannot find module" error is the expected TDD red-phase signal.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockFindUniqueCredential = jest.fn();
const mockUpsertRepoConnection = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    oAuthCredential: { findUnique: mockFindUniqueCredential },
    repoConnection: { upsert: mockUpsertRepoConnection },
  }),
}));

const mockDecryptToken = jest.fn();
jest.mock('@/lib/crypto', () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Subject under test ───────────────────────────────────────────────────────

import { connectRepository } from './repo-connection.actions';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION = { userId: 'usr_abc123' };
const VALID_URL = 'https://github.com/my-org/my-repo';
const ENCRYPTED_CREDENTIAL = {
  userId: 'usr_abc123',
  encryptedDek: 'enc_dek',
  dekNonce: 'dek_nonce',
  encryptedToken: 'enc_token',
  tokenNonce: 'token_nonce',
};
const DECRYPTED_TOKEN = 'gho_real_token';

const githubOkWithPush = {
  ok: true,
  status: 200,
  json: async () => ({ permissions: { push: true, pull: true, admin: false } }),
};

// ─── URL validation (AC-2, Task 4.2) ─────────────────────────────────────────

describe('connectRepository — URL validation (AC-2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockFindUniqueCredential.mockResolvedValue(ENCRYPTED_CREDENTIAL);
    mockDecryptToken.mockReturnValue(DECRYPTED_TOKEN);
    mockFetch.mockResolvedValue(githubOkWithPush);
    mockUpsertRepoConnection.mockResolvedValue({});
  });

  it('[P0] rejects a non-GitHub URL with errorCode INVALID_URL', async () => {
    const result = await connectRepository('https://gitlab.com/owner/repo');
    expect(result).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('[P0] rejects a plain string (not a URL) with errorCode INVALID_URL', async () => {
    const result = await connectRepository('not-a-url');
    expect(result).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('[P0] rejects a GitHub profile URL (no repo segment) with errorCode INVALID_URL', async () => {
    const result = await connectRepository('https://github.com/my-org');
    expect(result).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('[P1] error message for invalid URL references the expected github.com format', async () => {
    const result = await connectRepository('bad-url') as { error: string; errorCode: string };
    expect(result.error).toMatch(/github\.com/i);
  });

  it('[P0] accepts a URL with .git suffix (normalises it before storage)', async () => {
    const result = await connectRepository('https://github.com/my-org/my-repo.git');
    expect(result).toEqual({ success: true });
  });

  it('[P0] accepts a URL with trailing slash (normalises it before storage)', async () => {
    const result = await connectRepository('https://github.com/my-org/my-repo/');
    expect(result).toEqual({ success: true });
  });
});

// ─── Session and credential retrieval (AC-2, AC-3) ───────────────────────────

describe('connectRepository — session and credential checks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] returns errorCode UNKNOWN when session is missing', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });

  it('[P0] returns errorCode NO_CREDENTIAL when OAuthCredential row is absent', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUniqueCredential.mockResolvedValue(null);
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'NO_CREDENTIAL' });
  });

  it('[P1] NO_CREDENTIAL error message tells user to sign out and sign in again', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUniqueCredential.mockResolvedValue(null);
    const result = await connectRepository(VALID_URL) as { error: string };
    expect(result.error).toMatch(/sign.*(out|in)/i);
  });
});

// ─── GitHub API error cases (AC-4, Task 4.5) ─────────────────────────────────

describe('connectRepository — GitHub API errors (AC-4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockFindUniqueCredential.mockResolvedValue(ENCRYPTED_CREDENTIAL);
    mockDecryptToken.mockReturnValue(DECRYPTED_TOKEN);
  });

  it('[P0] returns errorCode NOT_FOUND when GitHub API returns 404 (AC-4)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'NOT_FOUND' });
  });

  it('[P1] NOT_FOUND error message names the specific cause (AC-4)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const result = await connectRepository(VALID_URL) as { error: string };
    expect(result.error).toMatch(/not found/i);
  });

  it('[P0] returns errorCode ORG_RESTRICTION when GitHub 403 indicates org OAuth App restriction (AC-4)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message:
          'Although you appear to have the correct authorization credentials, the organization has enabled OAuth App access restrictions.',
      }),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'ORG_RESTRICTION' });
  });

  it('[P0] ORG_RESTRICTION error explicitly names the org-restriction cause — NOT a generic message (AC-4)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message: 'Although you appear to have the correct authorization credentials, the organization has enabled OAuth App access restrictions.',
      }),
    });
    const result = await connectRepository(VALID_URL) as { error: string };
    expect(result.error).toMatch(/organization/i);
    expect(result.error).not.toMatch(/couldn.t connect|something went wrong|unexpected/i);
  });

  it('[P0] returns errorCode INSUFFICIENT_PERMISSION when GitHub returns 403 without org restriction (AC-4)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'INSUFFICIENT_PERMISSION' });
  });

  it('[P0] returns errorCode INSUFFICIENT_PERMISSION when permissions.push is false (AC-2, AC-4)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ permissions: { push: false, pull: true } }),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'INSUFFICIENT_PERMISSION' });
  });

  it('[P1] returns errorCode INSUFFICIENT_PERMISSION when permissions field is absent (AC-2)', async () => {
    // GitHub may omit permissions for repos the user accesses via org membership
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ name: 'my-repo' }),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'INSUFFICIENT_PERMISSION' });
  });

  it('[P1] returns errorCode UNKNOWN for an unexpected GitHub HTTP status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });

  it('[P1] returns errorCode UNKNOWN when fetch throws (network failure)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });
});

// ─── Successful connection (AC-2, AC-3, Task 4.6) ────────────────────────────

describe('connectRepository — successful connection (AC-2, AC-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockFindUniqueCredential.mockResolvedValue(ENCRYPTED_CREDENTIAL);
    mockDecryptToken.mockReturnValue(DECRYPTED_TOKEN);
    mockFetch.mockResolvedValue(githubOkWithPush);
    mockUpsertRepoConnection.mockResolvedValue({});
  });

  it('[P0] returns { success: true } when repo is accessible with write access', async () => {
    const result = await connectRepository(VALID_URL);
    expect(result).toEqual({ success: true });
  });

  it('[P0] upserts RepoConnection with repoUrl and credentialHealth "healthy" (AC-3)', async () => {
    await connectRepository(VALID_URL);
    expect(mockUpsertRepoConnection).toHaveBeenCalledWith({
      where: { userId: SESSION.userId },
      update: expect.objectContaining({ repoUrl: VALID_URL, credentialHealth: 'healthy' }),
      create: expect.objectContaining({
        userId: SESSION.userId,
        repoUrl: VALID_URL,
        credentialHealth: 'healthy',
      }),
    });
  });

  it('[P1] normalises .git suffix from the stored repoUrl (stores canonical form)', async () => {
    await connectRepository('https://github.com/my-org/my-repo.git');
    expect(mockUpsertRepoConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ repoUrl: VALID_URL }),
      }),
    );
  });

  it('[P0] calls the GitHub API with Bearer token in Authorization header (AC-2)', async () => {
    await connectRepository(VALID_URL);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.github.com/repos/my-org/my-repo'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${DECRYPTED_TOKEN}`,
        }),
      }),
    );
  });

  it('[P0] decrypted access token is NEVER returned to the client (AC-3)', async () => {
    const result = await connectRepository(VALID_URL);
    // The raw decrypted token value must not appear anywhere in the return value
    expect(JSON.stringify(result)).not.toContain(DECRYPTED_TOKEN);
  });
});
