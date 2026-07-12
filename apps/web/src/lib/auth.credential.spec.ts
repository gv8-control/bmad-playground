/**
 * @jest-environment node
 *
 * ATDD — Story 1.3: Connect a Repository by URL
 * Tests for the OAuthCredential storage added to auth.ts in Task 3.1.
 * Verifies the jwt callback encrypts and upserts the access token after user
 * upsert when account.access_token is present (AC-3).
 *
 * GREEN PHASE: all tests are un-skipped and passing.
 * auth.ts has been updated with credential storage and all tests are active.
 *
 * Relationship to auth.integration.spec.ts:
 *   auth.integration.spec.ts covers the existing jwt/session callbacks from Story 1.2.
 *   This file covers only the NEW credential-storage behaviour added in Story 1.3.
 */

import type { Account } from 'next-auth';
import type { JWT } from '@auth/core/jwt';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUserUpsert = jest.fn();
const mockOAuthCredentialUpsert = jest.fn();
const mockRepoConnectionUpdateMany = jest.fn();

jest.mock('./prisma', () => ({
  getPrisma: () => ({
    user: { upsert: mockUserUpsert },
    oAuthCredential: { upsert: mockOAuthCredentialUpsert },
    repoConnection: { updateMany: mockRepoConnectionUpdateMany },
  }),
}));

jest.mock('next-auth/providers/github', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'github', name: 'GitHub', type: 'oauth' })),
}));

const mockEncryptToken = jest.fn();
// virtual: true because crypto.ts does not exist until Task 2.1 is implemented.
jest.mock('./crypto', () => ({ encryptToken: (...args: unknown[]) => mockEncryptToken(...args) }), { virtual: true });

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn((_config: unknown) => ({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));

// ─── Extract jwt callback ─────────────────────────────────────────────────────

import NextAuth from 'next-auth';
// Side-effect import triggers NextAuth(config) call in auth.ts
import './auth';

const capturedConfig = (NextAuth as jest.Mock).mock.calls[0]?.[0] as {
  callbacks: {
    jwt: (args: { token: JWT; account: Account | null; profile?: unknown }) => Promise<JWT>;
  };
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GITHUB_PROFILE = { id: 123456, login: 'alice', name: 'Alice', email: 'alice@example.com' };

const ACCOUNT_WITH_TOKEN = {
  provider: 'github',
  access_token: 'gho_real_access_token',
} as unknown as Account;

const ACCOUNT_WITHOUT_TOKEN = {
  provider: 'github',
} as unknown as Account;

const ENCRYPTED_MOCK = {
  encryptedDek: 'enc_dek_base64',
  dekNonce: 'dek_nonce_base64',
  encryptedToken: 'enc_token_base64',
  tokenNonce: 'token_nonce_base64',
  kekId: 'fingerprint123ab',
};

// ─── Credential storage tests (AC-3) ─────────────────────────────────────────

describe('auth.ts jwt callback — OAuthCredential storage (AC-3, Task 3.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserUpsert.mockResolvedValue({ id: 'usr_abc123' });
    mockOAuthCredentialUpsert.mockResolvedValue({});
    mockRepoConnectionUpdateMany.mockResolvedValue({ count: 0 });
    mockEncryptToken.mockReturnValue(ENCRYPTED_MOCK);
    process.env.CREDENTIAL_ENCRYPTION_KEK = 'a'.repeat(64);
  });

  afterEach(() => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEK;
  });

  it('[P0] encrypts the access token using encryptToken on first sign-in (AC-3)', async () => {
    await capturedConfig.callbacks.jwt({
      token: {},
      account: ACCOUNT_WITH_TOKEN,
      profile: GITHUB_PROFILE,
    });

    expect(mockEncryptToken).toHaveBeenCalledTimes(1);
    expect(mockEncryptToken).toHaveBeenCalledWith('gho_real_access_token', 'usr_abc123');
  });

  it('[P0] upserts OAuthCredential with encrypted fields keyed by userId (AC-3)', async () => {
    await capturedConfig.callbacks.jwt({
      token: {},
      account: ACCOUNT_WITH_TOKEN,
      profile: GITHUB_PROFILE,
    });

    expect(mockOAuthCredentialUpsert).toHaveBeenCalledWith({
      where: { userId: 'usr_abc123' },
      update: {
        encryptedDek: ENCRYPTED_MOCK.encryptedDek,
        dekNonce: ENCRYPTED_MOCK.dekNonce,
        encryptedToken: ENCRYPTED_MOCK.encryptedToken,
        tokenNonce: ENCRYPTED_MOCK.tokenNonce,
        kekId: ENCRYPTED_MOCK.kekId,
      },
      create: {
        userId: 'usr_abc123',
        encryptedDek: ENCRYPTED_MOCK.encryptedDek,
        dekNonce: ENCRYPTED_MOCK.dekNonce,
        encryptedToken: ENCRYPTED_MOCK.encryptedToken,
        tokenNonce: ENCRYPTED_MOCK.tokenNonce,
        kekId: ENCRYPTED_MOCK.kekId,
      },
    });
  });

  it('[P0] does NOT store credential when account.access_token is absent', async () => {
    await capturedConfig.callbacks.jwt({
      token: {},
      account: ACCOUNT_WITHOUT_TOKEN,
      profile: GITHUB_PROFILE,
    });

    expect(mockEncryptToken).not.toHaveBeenCalled();
    expect(mockOAuthCredentialUpsert).not.toHaveBeenCalled();
  });

  it('[P1] does NOT store credential on session refresh (account is null)', async () => {
    await capturedConfig.callbacks.jwt({
      token: { userId: 'usr_existing' },
      account: null,
    });

    expect(mockEncryptToken).not.toHaveBeenCalled();
    expect(mockOAuthCredentialUpsert).not.toHaveBeenCalled();
  });

  it('[P0] raw access token is never placed in the JWT cookie (NEVER returned to browser) (AC-3)', async () => {
    const result = await capturedConfig.callbacks.jwt({
      token: {},
      account: ACCOUNT_WITH_TOKEN,
      profile: GITHUB_PROFILE,
    });

    // The raw token value must not appear anywhere in the returned JWT
    expect(JSON.stringify(result)).not.toContain('gho_real_access_token');
  });

  it('[P1] propagates error from oAuthCredential.upsert — sign-in fails rather than silently losing credential', async () => {
    mockOAuthCredentialUpsert.mockRejectedValue(new Error('DB write failed'));

    await expect(
      capturedConfig.callbacks.jwt({
        token: {},
        account: ACCOUNT_WITH_TOKEN,
        profile: GITHUB_PROFILE,
      }),
    ).rejects.toThrow('DB write failed');
  });

  it('[P1] credential upsert happens after the user upsert (user must exist first)', async () => {
    const callOrder: string[] = [];
    mockUserUpsert.mockImplementation(() => {
      callOrder.push('userUpsert');
      return Promise.resolve({ id: 'usr_abc123' });
    });
    mockOAuthCredentialUpsert.mockImplementation(() => {
      callOrder.push('credentialUpsert');
      return Promise.resolve({});
    });

    await capturedConfig.callbacks.jwt({
      token: {},
      account: ACCOUNT_WITH_TOKEN,
      profile: GITHUB_PROFILE,
    });

    expect(callOrder).toEqual(['userUpsert', 'credentialUpsert']);
  });

  it('[P0] calls repoConnection.updateMany with healthy status after credential upsert (AC-3)', async () => {
    await capturedConfig.callbacks.jwt({
      token: {},
      account: ACCOUNT_WITH_TOKEN,
      profile: GITHUB_PROFILE,
    });

    expect(mockRepoConnectionUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'usr_abc123' },
      data: { credentialHealth: 'healthy' },
    });
  });

  it('[P0] does NOT call repoConnection.updateMany when account.access_token is absent', async () => {
    await capturedConfig.callbacks.jwt({
      token: {},
      account: ACCOUNT_WITHOUT_TOKEN,
      profile: GITHUB_PROFILE,
    });

    expect(mockRepoConnectionUpdateMany).not.toHaveBeenCalled();
  });

  it('[P1] does not abort sign-in when repoConnection.updateMany rejects', async () => {
    mockRepoConnectionUpdateMany.mockRejectedValue(new Error('DB connection lost'));

    const result = await capturedConfig.callbacks.jwt({
      token: {},
      account: ACCOUNT_WITH_TOKEN,
      profile: GITHUB_PROFILE,
    });

    expect(result).toBeDefined();
    expect(mockRepoConnectionUpdateMany).toHaveBeenCalled();
  });
});
