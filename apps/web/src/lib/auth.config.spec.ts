/**
 * @jest-environment node
 *
 * ATDD — Story 1.2: Sign In with GitHub
 * Unit tests for the `authConfig.callbacks.authorized` middleware callback.
 *
 * Mocking notes:
 *   - `next-auth/providers/github` requires a server runtime — mocked below.
 *   - `next/server` NextResponse is mocked to a plain-object factory.
 *   - `Response.redirect` from the Web Fetch API is available in jsdom.
 *     The callback uses it to produce a 302; assertions check `response.status` and
 *     the `Location` header.
 */

import type { Session } from 'next-auth';
import type { NextRequest } from 'next/server';

jest.mock('next-auth/providers/github', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'github', name: 'GitHub', type: 'oauth' })),
}));

const mockNextResponseJson = jest.fn(
  (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
);

jest.mock('next/server', () => ({
  NextResponse: {
    json: (...args: Parameters<typeof mockNextResponseJson>) => mockNextResponseJson(...args),
  },
  NextRequest: jest.fn(),
}));

// Imported after mocks are registered so that the module sees the mocked deps.
import { authConfig } from './auth.config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRequest(pathname: string): Parameters<NonNullable<typeof authConfig.callbacks>['authorized']>[0]['request'] {
  return {
    nextUrl: { pathname } as URL,
    url: `http://localhost:3000${pathname}`,
  } as unknown as NextRequest;
}

const authenticatedSession: Session = {
  user: { name: 'Alice', email: 'alice@example.com', image: null },
  expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
};

// ─── authorized callback ──────────────────────────────────────────────────────

const authorized = authConfig.callbacks!.authorized!.bind(null);

describe('authConfig.callbacks.authorized', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('[P0] returns true for authenticated user on any route', () => {
    const result = authorized({ auth: authenticatedSession, request: mockRequest('/dashboard') });
    expect(result).toBe(true);
  });

  it('[P0] redirects unauthenticated page request to /sign-in', async () => {
    const result = authorized({ auth: null, request: mockRequest('/dashboard') }) as Response;

    // Response.redirect produces a 302 response
    expect(result.status).toBe(302);
    const location = result.headers.get('Location');
    expect(location).toMatch(/\/sign-in/);
  });

  it('[P0] includes callbackUrl matching the requested pathname', async () => {
    const result = authorized({ auth: null, request: mockRequest('/dashboard') }) as Response;

    const location = result.headers.get('Location')!;
    const locationUrl = new URL(location, 'http://localhost:3000');
    expect(locationUrl.searchParams.get('callbackUrl')).toBe('/dashboard');
  });

  it('[P1] returns a 401 JSON response for unauthenticated /api/* request', async () => {
    const result = authorized({ auth: null, request: mockRequest('/api/conversations') }) as Response;

    expect(result.status).toBe(401);
    const body = await result.json();
    expect(body).toMatchObject({ error: 'Unauthorized' });
  });
});

// ─── Provider configuration (AC-1c) ──────────────────────────────────────────

describe('authConfig provider configuration', () => {
  it('[P1] GitHub provider is the only configured provider', () => {
    expect(authConfig.providers).toHaveLength(1);
  });

  it('[P1] sign-in page is configured as /sign-in', () => {
    expect(authConfig.pages?.signIn).toBe('/sign-in');
  });
});
