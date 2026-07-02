/**
 * @jest-environment node
 *
 * Unit tests for the AppLayout server component (the (app) route group layout).
 * Covers: unauthenticated → /sign-in, no repo connection → /onboarding,
 * repo connection exists → AppShell with user data, queries by userId,
 * and no DB query when session is missing.
 */

const mockRedirect = jest.fn(() => {
  throw new Error('NEXT_REDIRECT');
});
jest.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockFindUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({ repoConnection: { findUnique: mockFindUnique } }),
}));

jest.mock('@/components/shell/AppShell', () => ({
  AppShell: ({ user, children }: { user: { name?: string | null }; children: React.ReactNode }) => (
    <div data-testid="app-shell" data-user={user.name}>
      {children}
    </div>
  ),
}));

import AppLayout from './layout';

const SESSION = {
  user: { name: 'Alice', email: 'alice@example.com', image: null },
  userId: 'usr_abc123',
  expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
};
const CHILDREN = 'app content';

describe('AppLayout auth guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] redirects unauthenticated user to /sign-in', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(AppLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('[P0] redirects session without user to /sign-in', async () => {
    mockAuth.mockResolvedValue({ expires: new Date().toISOString() });
    await expect(AppLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('[P0] redirects session without userId to /sign-in', async () => {
    mockAuth.mockResolvedValue({ user: { name: 'Alice' }, expires: new Date().toISOString() });
    await expect(AppLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });
});

describe('AppLayout repo-connection guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] redirects authenticated user without repo connection to /onboarding', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(null);
    await expect(AppLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('[P0] renders AppShell with user data when repo connection exists', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue({ id: 'conn_1', repoUrl: 'https://github.com/a/b' });
    const result = (await AppLayout({ children: CHILDREN })) as React.ReactElement;
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.props.user).toEqual(SESSION.user);
    expect(result.props.children).toBe(CHILDREN);
  });

  it('[P1] queries RepoConnection by the session userId', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(null);
    await expect(AppLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { userId: SESSION.userId } });
  });

  it('[P1] does not query the database when session is missing', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(AppLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
