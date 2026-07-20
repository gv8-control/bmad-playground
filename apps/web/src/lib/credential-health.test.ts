/**
 * @jest-environment node
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
jest.mock('./crypto', () => {
  const actual = jest.requireActual('./crypto');
  return {
    ...actual,
    decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
  };
});

// ─── Subject under test ───────────────────────────────────────────────────────

import { KekConfigurationError } from './crypto';
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

// Distinct second user + credential for cross-tenant negative-path tests (AC-2).
const USER_B_ID = 'usr_other456';
const USER_B_CREDENTIAL = {
  userId: USER_B_ID,
  encryptedDek: 'enc_dek_b',
  dekNonce: 'dek_nonce_b',
  encryptedToken: 'enc_token_b',
  tokenNonce: 'token_nonce_b',
};
const USER_B_TOKEN = 'gho_user_b_token';

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
    expect(mockDecryptToken).toHaveBeenCalledWith(ENCRYPTED_CREDENTIAL, USER_ID);
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

  it('[P0] throws CredentialFailureError(401) when decryptToken fails (tampered credential, KEK mismatch, legacy pre-AAD row)', async () => {
    const decryptError = new Error('Unsupported state or unable to authenticate data');
    mockDecryptToken.mockImplementation(() => {
      throw decryptError;
    });
    try {
      await resolveOAuthToken(USER_ID);
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CredentialFailureError);
      expect((err as CredentialFailureError).statusCode).toBe(401);
      expect((err as CredentialFailureError & { cause?: unknown }).cause).toBe(decryptError);
    }
  });

  it('[P1] logs the original decryptToken error with the userId for triage', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const decryptError = new Error('Unsupported state or unable to authenticate data');
    mockDecryptToken.mockImplementation(() => {
      throw decryptError;
    });
    await expect(resolveOAuthToken(USER_ID)).rejects.toThrow(CredentialFailureError);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(USER_ID),
      decryptError,
    );
    consoleErrorSpy.mockRestore();
  });

  it('[P0] re-throws KekConfigurationError as-is — a bad env var is an ops problem, not a per-user credential problem', async () => {
    const kekError = new KekConfigurationError(
      'CREDENTIAL_ENCRYPTION_KEK must be a 64-character hex string',
    );
    mockDecryptToken.mockImplementation(() => {
      throw kekError;
    });
    await expect(resolveOAuthToken(USER_ID)).rejects.toBe(kekError);
  });

  it('[P1] a database error from findUnique propagates as-is — not reclassified as CredentialFailureError', async () => {
    const dbError = new Error('Connection terminated unexpectedly');
    mockFindUniqueCredential.mockRejectedValue(dbError);
    await expect(resolveOAuthToken(USER_ID)).rejects.toBe(dbError);
  });

  it('[P0] queries only by the provided userId — never another user (AC-2 tenant isolation)', async () => {
    await resolveOAuthToken(USER_ID);
    expect(mockFindUniqueCredential).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
  });

  it('[P0] denies cross-tenant resolution — never returns another user\'s token (AC-2 negative path)', async () => {
    // Seed: userB owns a credential; userA owns none. The mock mirrors Prisma's
    // findUnique scoping — a row is returned only when the where-clause userId
    // matches userB; querying for userA yields null.
    mockFindUniqueCredential.mockImplementation((args: { where: { userId: string } }) =>
      args.where.userId === USER_B_ID ? Promise.resolve(USER_B_CREDENTIAL) : Promise.resolve(null),
    );
    mockDecryptToken.mockReturnValue(USER_B_TOKEN);

    // Positive control: userB resolves their own token. Proves userB's credential
    // is reachable in the seeded store — so the negative path below is a genuine
    // cross-tenant denial, not an empty-store artifact.
    await expect(resolveOAuthToken(USER_B_ID)).resolves.toBe(USER_B_TOKEN);

    // Negative path: userA attempts resolution. The tenant-scoped query cannot
    // reach userB's row, so the lookup returns not-found and the service throws
    // — userB's token is never decrypted under userA's context.
    await expect(resolveOAuthToken(USER_ID)).rejects.toThrow(CredentialFailureError);
    expect(mockDecryptToken).toHaveBeenCalledTimes(1);
    expect(mockDecryptToken).toHaveBeenCalledWith(USER_B_CREDENTIAL, USER_B_ID);
    // Load-bearing: catches a `where: {}` scoping regression (would return
    // userB's row for userA). Not redundant with the prior positive-path test.
    expect(mockFindUniqueCredential).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });
});

// ─── markCredentialFailed (AC-1) ──────────────────────────────────────────────

describe('markCredentialFailed (AC-1 — 401/403 detection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateManyRepoConnection.mockResolvedValue({ count: 1 });
  });

  it('[P0] updates credentialHealth to "failed" using an unconditional where-clause when no capturedAt is given (AC-1)', async () => {
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

  // ─── Race condition guard (optimistic concurrency via updatedAt) ───────────

  it('[P0] guards the update with updatedAt < capturedAt when capturedAt is provided', async () => {
    const capturedAt = new Date('2026-07-02T10:00:00.000Z');
    await markCredentialFailed(USER_ID, capturedAt);
    expect(mockUpdateManyRepoConnection).toHaveBeenCalledWith({
      where: { userId: USER_ID, updatedAt: { lt: capturedAt } },
      data: { credentialHealth: 'failed' },
    });
  });

  it('[P0] race: a stale "failed" write (capturedAt before a concurrent re-auth) is a silent no-op', async () => {
    // Simulates: request A reads the token, GitHub call fails; concurrently,
    // request B (re-auth) writes `healthy` and bumps updatedAt. Request A's
    // failed write now targets a row whose updatedAt is newer than capturedAt,
    // so the conditional updateMany matches zero rows.
    const capturedAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago — stale
    mockUpdateManyRepoConnection.mockResolvedValue({ count: 0 });

    await expect(markCredentialFailed(USER_ID, capturedAt)).resolves.toBeUndefined();
    expect(mockUpdateManyRepoConnection).toHaveBeenCalledWith({
      where: { userId: USER_ID, updatedAt: { lt: capturedAt } },
      data: { credentialHealth: 'failed' },
    });
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
