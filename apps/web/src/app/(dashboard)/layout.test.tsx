/**
 * @jest-environment node
 *
 * Unit tests for the DashboardLayout server component.
 * Covers the defense-in-depth auth guard: unauthenticated → /sign-in,
 * authenticated users render children without redirect.
 * Also covers conditional shell rendering: no repo connection → bare children,
 * repo connection exists → AppShell with user data.
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

import DashboardLayout from './layout';

const SESSION = {
  user: { name: 'Alice', email: 'alice@example.com', image: null },
  userId: 'usr_abc123',
  expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
};
const CHILDREN = 'dashboard content';

describe('DashboardLayout auth guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] redirects unauthenticated user to /sign-in', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(DashboardLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('[P0] redirects session without user to /sign-in', async () => {
    mockAuth.mockResolvedValue({ expires: new Date().toISOString() });
    await expect(DashboardLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('[P0] redirects session without userId to /sign-in', async () => {
    mockAuth.mockResolvedValue({ user: { name: 'Alice' }, expires: new Date().toISOString() });
    await expect(DashboardLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });
});

describe('DashboardLayout conditional shell rendering', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders children without AppShell when no repo connection exists', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(null);
    const result = (await DashboardLayout({ children: CHILDREN })) as React.ReactElement;
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.props['data-testid']).toBeUndefined();
    expect(result.props.children).toBe(CHILDREN);
  });

  it('[P0] renders AppShell with user data when repo connection exists', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue({ id: 'conn_1', repoUrl: 'https://github.com/a/b' });
    const result = (await DashboardLayout({ children: CHILDREN })) as React.ReactElement;
    expect(result.props.user).toEqual(SESSION.user);
    expect(result.props.children).toBe(CHILDREN);
  });

  it('[P1] queries RepoConnection by the session userId', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(null);
    await DashboardLayout({ children: CHILDREN });
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { userId: SESSION.userId } });
  });

  it('[P1] does not query the database when session is missing', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(DashboardLayout({ children: CHILDREN })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
