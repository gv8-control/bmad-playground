/**
 * @jest-environment node
 *
 * Unit tests for the internal test helper route:
 *   DELETE /api/internal/test/repo-connections/[id] — removes a RepoConnection row
 *
 * This route is test infrastructure used by E2E fixture teardown (withRepoConnection).
 * It must be non-functional in production (return 404).
 */

const mockRepoConnectionDelete = jest.fn();

jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    repoConnection: { delete: mockRepoConnectionDelete },
  }),
}));

import { DELETE } from './route';

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/internal/test/repo-connections/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] deletes the connection by id and returns { ok: true }', async () => {
    mockRepoConnectionDelete.mockResolvedValue({ id: 'conn_abc' });
    const res = await DELETE({} as Request, makeParams('conn_abc'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('[P0] calls delete with the correct where clause', async () => {
    mockRepoConnectionDelete.mockResolvedValue({ id: 'conn_xyz' });
    await DELETE({} as Request, makeParams('conn_xyz'));
    expect(mockRepoConnectionDelete).toHaveBeenCalledWith({ where: { id: 'conn_xyz' } });
  });

  it('[P0] returns 404 in production', async () => {
    const prev = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await DELETE({} as Request, makeParams('conn_1'));
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prev, configurable: true });
  });
});
