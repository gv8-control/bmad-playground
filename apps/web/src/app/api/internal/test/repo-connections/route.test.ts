/**
 * @jest-environment node
 *
 * Unit tests for the internal test helper route:
 *   POST /api/internal/test/repo-connections — upserts a RepoConnection row
 *
 * This route is test infrastructure used by E2E fixtures (custom-fixtures.ts withRepoConnection).
 * It must be non-functional in production (return 404).
 */

const mockRepoConnectionUpsert = jest.fn();

jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    repoConnection: { upsert: mockRepoConnectionUpsert },
  }),
}));

import { POST } from './route';

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

describe('POST /api/internal/test/repo-connections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] upserts the connection and returns 200 with id', async () => {
    mockRepoConnectionUpsert.mockResolvedValue({ id: 'conn_abc' });
    const res = await POST(makeRequest({ userId: 'usr_1', repoUrl: 'https://github.com/a/b' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 'conn_abc' });
  });

  it('[P0] returns 404 in production without test-endpoint bypass', async () => {
    const prevEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await POST(makeRequest({ userId: 'usr_1', repoUrl: 'https://github.com/a/b' }));
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prevEnv, configurable: true });
  });

  it('[P0] returns 404 when TEST_ENV is unset', async () => {
    delete process.env.TEST_ENV;
    const res = await POST(makeRequest({ userId: 'usr_1', repoUrl: 'https://github.com/a/b' }));
    expect(res.status).toBe(404);
  });
});
