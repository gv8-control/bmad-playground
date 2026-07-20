/**
 * @jest-environment node
 *
 * Unit tests for the internal test helper routes:
 *   POST /api/internal/test/seed-user  — upserts a User row
 *   DELETE /api/internal/test/seed-user — removes a User row by githubId
 *
 * These routes are test infrastructure used by E2E fixtures (auth.setup.ts,
 * custom-fixtures.ts). They must be non-functional in production (return 404).
 */

const mockUserUpsert = jest.fn();
const mockUserDeleteMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    user: { upsert: mockUserUpsert, deleteMany: mockUserDeleteMany },
  }),
}));

import { POST, DELETE } from './route';

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

describe('POST /api/internal/test/seed-user', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] upserts the user and returns 200 with userId', async () => {
    mockUserUpsert.mockResolvedValue({ id: 'usr_abc', githubId: 'gh_1', githubLogin: 'alice' });
    const res = await POST(makeRequest({ githubId: 'gh_1', githubLogin: 'alice', name: 'Alice' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ userId: 'usr_abc' });
  });

  it('[P0] returns 404 in production without test-endpoint bypass', async () => {
    const prevEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await POST(makeRequest({ githubId: 'gh_1', githubLogin: 'alice' }));
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prevEnv, configurable: true });
  });

  it('[P0] returns 404 when TEST_ENV is unset', async () => {
    delete process.env.TEST_ENV;
    const res = await POST(makeRequest({ githubId: 'gh_1', githubLogin: 'alice' }));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/internal/test/seed-user', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] deletes the user by githubId and returns { ok: true }', async () => {
    mockUserDeleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(makeRequest({ githubId: 'gh_1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('[P0] returns 404 in production without test-endpoint bypass', async () => {
    const prevEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await DELETE(makeRequest({ githubId: 'gh_1' }));
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prevEnv, configurable: true });
  });
});
