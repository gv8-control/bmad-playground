/**
 * @jest-environment node
 *
 * Unit tests for the OnboardingPage server component.
 * Covers redirect guards: unauthenticated → /sign-in,
 * already connected → /project-map; and that authenticated users
 * without a connection reach the page content (no redirect).
 */

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockFindUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({ repoConnection: { findUnique: mockFindUnique } }),
}));

jest.mock('@/components/onboarding/RepositoryUrlForm', () => ({
  RepositoryUrlForm: () => null,
}));

import OnboardingPage from './page';

const SESSION = { userId: 'usr_abc123' };
const EXISTING_CONNECTION = { id: 'conn_1', repoUrl: 'https://github.com/a/b' };

describe('OnboardingPage redirect logic', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] redirects unauthenticated user to /sign-in', async () => {
    mockAuth.mockResolvedValue(null);
    await OnboardingPage();
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('[P0] redirects authenticated user who already has a RepoConnection to /project-map', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(EXISTING_CONNECTION);
    await OnboardingPage();
    expect(mockRedirect).toHaveBeenCalledWith('/project-map');
  });

  it('[P0] does not redirect authenticated user with no RepoConnection', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(null);
    await OnboardingPage();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('[P1] queries RepoConnection by the session userId', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(null);
    await OnboardingPage();
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { userId: SESSION.userId } });
  });

  it('[P1] does not query the database when session is missing', async () => {
    mockAuth.mockResolvedValue(null);
    await OnboardingPage();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('[P1] does not query the database when session has no userId', async () => {
    mockAuth.mockResolvedValue({ user: { name: 'Alice' } });
    await OnboardingPage();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
