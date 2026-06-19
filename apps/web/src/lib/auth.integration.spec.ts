/**
 * @jest-environment node
 *
 * ATDD — Story 1.2: Sign In with GitHub
 * Tests for the jwt and session callbacks in auth.ts.
 * Verifies user upsert behaviour and session token propagation.
 *
 * Prisma is mocked — no live DB required. The mock asserts the upsert
 * contract; the Prisma migration itself validates the schema separately.
 */

import type { Account, Session } from 'next-auth';
import type { JWT } from '@auth/core/jwt';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUpsert = jest.fn();
jest.mock('./prisma', () => ({
  getPrisma: () => ({ user: { upsert: mockUpsert } }),
}));

jest.mock('next-auth/providers/github', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'github', name: 'GitHub', type: 'oauth' })),
}));

// Capture the config passed to NextAuth without needing a real Auth.js runtime.
jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn((_config: unknown) => ({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));

// ─── Extract callbacks ────────────────────────────────────────────────────────

import NextAuth from 'next-auth';
// Side-effect import triggers the NextAuth(config) call in auth.ts; exports unused.
import './auth';

const capturedConfig = (NextAuth as jest.Mock).mock.calls[0]?.[0] as {
  callbacks: {
    jwt: (args: { token: JWT; account: Account | null; profile?: unknown }) => Promise<JWT>;
    session: (args: { session: Session; token: JWT }) => Promise<Session>;
  };
  session: { strategy: string; maxAge: number };
};

// ─── jwt callback ─────────────────────────────────────────────────────────────

describe('auth.ts jwt callback', () => {
  const githubProfile = {
    id: 123456,
    login: 'alice',
    name: 'Alice',
    email: 'alice@example.com',
  };

  const githubAccount = { provider: 'github' } as unknown as Account;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({ id: 'usr_abc123' });
  });

  it('[P0] upserts user in database on first GitHub sign-in', async () => {
    await capturedConfig.callbacks.jwt({ token: {}, account: githubAccount, profile: githubProfile });

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { githubId: '123456' },
      update: { name: 'Alice', email: 'alice@example.com', githubLogin: 'alice' },
      create: {
        githubId: '123456',
        githubLogin: 'alice',
        name: 'Alice',
        email: 'alice@example.com',
      },
    });
  });

  it('[P0] stores the upserted user id in token.userId', async () => {
    const result = await capturedConfig.callbacks.jwt({
      token: {},
      account: githubAccount,
      profile: githubProfile,
    });

    expect(result.userId).toBe('usr_abc123');
  });

  it('[P1] stores null email when GitHub provides no email', async () => {
    await capturedConfig.callbacks.jwt({
      token: {},
      account: githubAccount,
      profile: { ...githubProfile, email: null },
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ email: null }),
        create: expect.objectContaining({ email: null }),
      }),
    );
  });

  it('[P1] is a no-op on subsequent calls (session refresh, no account)', async () => {
    const token: JWT = { userId: 'usr_existing' };
    const result = await capturedConfig.callbacks.jwt({ token, account: null });

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(result.userId).toBe('usr_existing');
  });
});

// ─── session callback ─────────────────────────────────────────────────────────

describe('auth.ts session callback', () => {
  it('[P0] propagates token.userId to session.userId', async () => {
    const session = { user: { name: 'Alice' }, expires: 'sometime' } as unknown as Session;
    const result = await capturedConfig.callbacks.session({ session, token: { userId: 'usr_abc123' } });

    expect(result.userId).toBe('usr_abc123');
  });

  it('[P1] does not set session.userId when token carries none', async () => {
    const session = { user: { name: 'Alice' }, expires: 'sometime' } as unknown as Session;
    const result = await capturedConfig.callbacks.session({ session, token: {} });

    expect(result.userId).toBeUndefined();
  });
});

// ─── session config ───────────────────────────────────────────────────────────

describe('auth.ts session config', () => {
  it('[P0] JWT strategy with maxAge of 8 hours', () => {
    expect(capturedConfig.session.strategy).toBe('jwt');
    expect(capturedConfig.session.maxAge).toBe(8 * 60 * 60);
  });
});
