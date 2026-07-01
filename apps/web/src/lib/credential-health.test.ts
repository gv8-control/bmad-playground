/**
 * @jest-environment node
 *
 * Unit tests for the credential health service (Story 1.6).
 * Covers resolveOAuthToken (AC-2 tenant-scoped resolution),
 * markCredentialFailed (AC-1), markCredentialHealthy (AC-3),
 * and getCredentialHealth.
 */

import type { CredentialHealthStatus } from '@bmad-easy/shared-types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFindUniqueCredential = jest.fn();
const mockUpdateManyRepoConnection = jest.fn();
const mockFindUniqueRepoConnection = jest.fn();

jest.mock('./prisma', () => ({
  getPrisma: () => ({
    oAuthCredential: { findUnique: mockFindUniqueCredential },
    repoConnection: {
      updateMany: mockUpdateManyRepoConnection,
      findUnique: mockFindUniqueRepoConnection,
    },
  }),
}));

const mockDecryptToken = jest.fn();
jest.mock('./crypto', () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import {
  resolveOAuthToken,
  markCredentialFailed,
  markCredentialHealthy,
  getCredentialHealth,
  CredentialFailureError,
} from './credential-health';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = 'usr_abc123';
const ENCRYPTED_CREDENTIAL = {
  userId: USER_ID,
  encryptedDek: 'enc_dek',
  dekNonce: 'dek_nonce',
  encryptedToken: 'enc_token',
  tokenNonce: 'token_nonce',
};
const DECRYPTED_TOKEN = 'gho_real_token';

// ─── resolveOAuthToken (AC-2) ─────────────────────────────────────────────────

describe('resolveOAuthToken (AC-2 — tenant-scoped credential resolution)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUniqueCredential.mockResolvedValue(ENCRYPTED_CREDENTIAL);
    mockDecryptToken.mockReturnValue(DECRYPTED_TOKEN);
  });

  it('[P0] returns decrypted token for valid userId (AC-2)', async () => {
    const token = await resolveOAuthToken(USER_ID);
    expect(token).toBe(DECRYPTED_TOKEN);
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith(ENCRYPTED_CREDENTIAL);
  });

  it('[P0] throws CredentialFailureError when no OAuthCredential exists (AC-2)', async () => {
    mockFindUniqueCredential.mockResolvedValue(null);
    await expect(resolveOAuthToken(USER_ID)).rejects.toThrow(CredentialFailureError);
  });

  it('[P0] CredentialFailureError carries statusCode 401 when credential is missing', async () => {
    mockFindUniqueCredential.mockResolvedValue(null);
    try {
      await resolveOAuthToken(USER_ID);
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CredentialFailureError);
      expect((err as CredentialFailureError).statusCode).toBe(401);
    }
  });

  it('[P0] throws when decryptToken fails (tampered credential, KEK rotation mismatch)', async () => {
    mockDecryptToken.mockImplementation(() => {
      throw new Error('Decryption failed: invalid auth tag');
    });
    await expect(resolveOAuthToken(USER_ID)).rejects.toThrow('Decryption failed');
  });

  it('[P0] queries only by the provided userId — never another user (AC-2 tenant isolation)', async () => {
    await resolveOAuthToken(USER_ID);
    expect(mockFindUniqueCredential).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
  });

  it('[P1] does not query for any other userId', async () => {
    await resolveOAuthToken(USER_ID);
    const callArg = mockFindUniqueCredential.mock.calls[0]?.[0];
    expect(callArg).toEqual({ where: { userId: USER_ID } });
    expect(JSON.stringify(callArg)).not.toContain('usr_other');
  });
});

// ─── markCredentialFailed (AC-1) ──────────────────────────────────────────────

describe('markCredentialFailed (AC-1 — 401/403 detection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateManyRepoConnection.mockResolvedValue({ count: 1 });
  });

  it('[P0] updates credentialHealth to "failed" (AC-1)', async () => {
    await markCredentialFailed(USER_ID);
    expect(mockUpdateManyRepoConnection).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { credentialHealth: 'failed' },
    });
  });

  it('[P0] is a no-op (no throw) when no RepoConnection exists', async () => {
    mockUpdateManyRepoConnection.mockResolvedValue({ count: 0 });
    await expect(markCredentialFailed(USER_ID)).resolves.toBeUndefined();
  });

  it('[P1] does not throw when updateMany rejects (best-effort)', async () => {
    mockUpdateManyRepoConnection.mockRejectedValue(new Error('DB connection lost'));
    await expect(markCredentialFailed(USER_ID)).resolves.toBeUndefined();
  });
});

// ─── markCredentialHealthy (AC-3) ─────────────────────────────────────────────

describe('markCredentialHealthy (AC-3 — re-auth restores health)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateManyRepoConnection.mockResolvedValue({ count: 1 });
  });

  it('[P0] updates credentialHealth to "healthy" (AC-3)', async () => {
    await markCredentialHealthy(USER_ID);
    expect(mockUpdateManyRepoConnection).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { credentialHealth: 'healthy' },
    });
  });

  it('[P0] is a no-op when no RepoConnection exists', async () => {
    mockUpdateManyRepoConnection.mockResolvedValue({ count: 0 });
    await expect(markCredentialHealthy(USER_ID)).resolves.toBeUndefined();
  });
});

// ─── getCredentialHealth ──────────────────────────────────────────────────────

describe('getCredentialHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('[P0] returns "healthy" for existing RepoConnection with healthy status', async () => {
    mockFindUniqueRepoConnection.mockResolvedValue({ credentialHealth: 'healthy' });
    const result = await getCredentialHealth(USER_ID);
    expect(result).toBe('healthy' as CredentialHealthStatus);
  });

  it('[P0] returns "failed" for existing RepoConnection with failed status', async () => {
    mockFindUniqueRepoConnection.mockResolvedValue({ credentialHealth: 'failed' });
    const result = await getCredentialHealth(USER_ID);
    expect(result).toBe('failed' as CredentialHealthStatus);
  });

  it('[P0] returns null when no RepoConnection exists', async () => {
    mockFindUniqueRepoConnection.mockResolvedValue(null);
    const result = await getCredentialHealth(USER_ID);
    expect(result).toBeNull();
  });

  it('[P1] selects only credentialHealth column', async () => {
    mockFindUniqueRepoConnection.mockResolvedValue({ credentialHealth: 'healthy' });
    await getCredentialHealth(USER_ID);
    expect(mockFindUniqueRepoConnection).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      select: { credentialHealth: true },
    });
  });
});
