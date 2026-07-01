/**
 * @jest-environment node
 *
 * Integration tests for getGitIdentity Server Action — Story 1.5 AC-3.
 */
const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockFindUniqueUser = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    user: { findUnique: mockFindUniqueUser },
  }),
}));

import { getGitIdentity } from './git-identity.actions';

afterEach(() => {
  jest.clearAllMocks();
});

describe('getGitIdentity (AC-3)', () => {
  it('returns GitUserConfig for authenticated user with complete profile', async () => {
    mockAuth.mockResolvedValue({ userId: 'usr_123' });
    mockFindUniqueUser.mockResolvedValue({
      name: 'Jane Developer',
      email: 'jane@example.com',
      githubLogin: 'janedev',
    });

    const result = await getGitIdentity();

    expect(result).toEqual({
      success: true,
      name: 'Jane Developer',
      email: 'jane@example.com',
    });
  });

  it('returns noreply fallback email when user email is null', async () => {
    mockAuth.mockResolvedValue({ userId: 'usr_123' });
    mockFindUniqueUser.mockResolvedValue({
      name: 'Jane Developer',
      email: null,
      githubLogin: 'janedev',
    });

    const result = await getGitIdentity();

    expect(result).toEqual({
      success: true,
      name: 'Jane Developer',
      email: 'janedev@users.noreply.github.com',
    });
  });

  it('returns name fallback when user name is null', async () => {
    mockAuth.mockResolvedValue({ userId: 'usr_123' });
    mockFindUniqueUser.mockResolvedValue({
      name: null,
      email: 'jane@example.com',
      githubLogin: 'janedev',
    });

    const result = await getGitIdentity();

    expect(result).toEqual({
      success: true,
      name: 'janedev',
      email: 'jane@example.com',
    });
  });

  it('returns error when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await getGitIdentity();

    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('returns error when session has no userId', async () => {
    mockAuth.mockResolvedValue({});

    const result = await getGitIdentity();

    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('returns error when User row is not found', async () => {
    mockAuth.mockResolvedValue({ userId: 'usr_123' });
    mockFindUniqueUser.mockResolvedValue(null);

    const result = await getGitIdentity();

    expect(result).toEqual({ success: false, error: 'User not found' });
  });

  it('returns error on unexpected DB failure', async () => {
    mockAuth.mockResolvedValue({ userId: 'usr_123' });
    mockFindUniqueUser.mockRejectedValue(new Error('DB connection lost'));

    const result = await getGitIdentity();

    expect(result).toEqual({ success: false, error: 'Failed to resolve git identity' });
  });

  it('selects only name, email, githubLogin — never token fields (AC-3)', async () => {
    mockAuth.mockResolvedValue({ userId: 'usr_123' });
    mockFindUniqueUser.mockResolvedValue({
      name: 'Jane',
      email: 'jane@example.com',
      githubLogin: 'janedev',
    });

    await getGitIdentity();

    expect(mockFindUniqueUser).toHaveBeenCalledWith({
      where: { id: 'usr_123' },
      select: { name: true, email: true, githubLogin: true },
    });
  });

  it('returned GitUserConfig contains no token field (AC-3)', async () => {
    mockAuth.mockResolvedValue({ userId: 'usr_123' });
    mockFindUniqueUser.mockResolvedValue({
      name: 'Jane',
      email: 'jane@example.com',
      githubLogin: 'janedev',
    });

    const result = await getGitIdentity();

    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('encryptedToken');
    expect(result).not.toHaveProperty('token');
  });
});
