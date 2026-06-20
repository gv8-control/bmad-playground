/**
 * @jest-environment node
 *
 * Unit tests for the root HomePage server component (apps/web/src/app/page.tsx).
 * Covers the redirect routing logic: unauthenticated → /sign-in,
 * authenticated + no RepoConnection → /onboarding,
 * authenticated + existing RepoConnection → /project-map.
 */

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockFindUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({ repoConnection: { findUnique: mockFindUnique } }),
}));

import HomePage from './page';

const SESSION = { userId: 'usr_abc123' };

describe('HomePage redirect logic', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] redirects unauthenticated user to /sign-in', async () => {
    mockAuth.mockResolvedValue(null);
    await HomePage();
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('[P0] redirects authenticated user with no RepoConnection to /onboarding', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(null);
    await HomePage();
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('[P0] redirects authenticated user with an existing RepoConnection to /project-map', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue({ id: 'conn_1', repoUrl: 'https://github.com/a/b' });
    await HomePage();
    expect(mockRedirect).toHaveBeenCalledWith('/project-map');
  });

  it('[P1] queries RepoConnection by the session userId', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(null);
    await HomePage();
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { userId: SESSION.userId } });
  });

  it('[P1] does not query the database when session is missing', async () => {
    mockAuth.mockResolvedValue(null);
    await HomePage();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('[P1] does not query the database when session has no userId', async () => {
    mockAuth.mockResolvedValue({ user: { name: 'Alice' } });
    await HomePage();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
