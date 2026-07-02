/**
 * @jest-environment node
 *
 * Unit tests for the DashboardLayout server component (the (dashboard) route group layout).
 * Covers the defense-in-depth auth guard: unauthenticated → /sign-in,
 * authenticated users render bare children (no AppShell — that lives in the (app) layout).
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

describe('DashboardLayout bare render', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders bare children for authenticated user (no AppShell)', async () => {
    mockAuth.mockResolvedValue(SESSION);
    const result = (await DashboardLayout({ children: CHILDREN })) as React.ReactElement;
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.props['data-testid']).toBeUndefined();
    expect(result.props.children).toBe(CHILDREN);
  });
});
