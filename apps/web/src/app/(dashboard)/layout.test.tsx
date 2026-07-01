/**
 * @jest-environment node
 *
 * Unit tests for the DashboardLayout server component.
 * Covers the defense-in-depth auth guard: unauthenticated → /sign-in,
 * authenticated users render children without redirect.
 */

const mockRedirect = jest.fn(() => {
  throw new Error('NEXT_REDIRECT');
});
jest.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

import DashboardLayout from './layout';

const SESSION = {
  user: { name: 'Alice', email: 'alice@example.com', image: null },
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

  it('[P0] renders children for authenticated user without redirect', async () => {
    mockAuth.mockResolvedValue(SESSION);
    const result = (await DashboardLayout({ children: CHILDREN })) as React.ReactElement;
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.props.children).toBe(CHILDREN);
  });
});
