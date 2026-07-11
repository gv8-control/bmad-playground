/**
 * @jest-environment node
 *
 * Unit tests for the internal test helper route:
 *   POST   /api/internal/test/artifacts — seeds Artifact rows for a RepoConnection
 *   DELETE /api/internal/test/artifacts — removes all Artifact rows for a RepoConnection
 *
 * This route is test infrastructure used by E2E fixtures (custom-fixtures.ts withArtifacts).
 * It must be non-functional in production (return 404).
 */

const mockArtifactCreate = jest.fn();
const mockArtifactDeleteMany = jest.fn();
const mock$Transaction = jest.fn();

jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    artifact: {
      create: mockArtifactCreate,
      deleteMany: mockArtifactDeleteMany,
    },
    $transaction: mock$Transaction,
  }),
}));

import { POST, DELETE } from './route';

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

describe('POST /api/internal/test/artifacts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] creates artifacts and returns 200 with ids', async () => {
    mock$Transaction.mockResolvedValue([
      { id: 'art_1' },
      { id: 'art_2' },
    ]);
    const res = await POST(
      makeRequest({
        repoConnectionId: 'conn_abc',
        artifacts: [
          { path: 'a.md', type: 'prd', title: 'PRD' },
          { path: 'b.md', type: 'architecture', title: 'Arch' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ids: ['art_1', 'art_2'] });
  });

  it('[P0] calls $transaction with create operations for each artifact', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'art_1' }]);
    await POST(
      makeRequest({
        repoConnectionId: 'conn_1',
        artifacts: [{ path: 'p.md', type: 'prd', title: 'T' }],
      }),
    );
    expect(mock$Transaction).toHaveBeenCalledTimes(1);
    expect(mockArtifactCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repoConnectionId: 'conn_1',
        path: 'p.md',
        type: 'prd',
        title: 'T',
        status: 'completed',
      }),
    });
  });

  it('[P1] defaults status to "completed" when omitted', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'art_1' }]);
    await POST(
      makeRequest({
        repoConnectionId: 'conn_1',
        artifacts: [{ path: 'p.md', type: 'prd', title: 'T' }],
      }),
    );
    expect(mockArtifactCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });

  it('[P1] passes through explicit status and lastModifiedAt', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'art_1' }]);
    await POST(
      makeRequest({
        repoConnectionId: 'conn_1',
        artifacts: [
          {
            path: 'p.md',
            type: 'architecture',
            title: 'T',
            status: 'in-progress',
            lastModifiedAt: '2026-07-01T00:00:00.000Z',
            content: '# content',
          },
        ],
      }),
    );
    expect(mockArtifactCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'in-progress',
        content: '# content',
        lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
    });
  });

  it('[P0] returns 404 in production', async () => {
    const prev = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await POST(
      makeRequest({ repoConnectionId: 'c', artifacts: [] }),
    );
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prev, configurable: true });
  });
});

describe('DELETE /api/internal/test/artifacts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] deletes artifacts by repoConnectionId and returns { ok: true }', async () => {
    mockArtifactDeleteMany.mockResolvedValue({ count: 3 });
    const res = await DELETE(makeRequest({ repoConnectionId: 'conn_abc' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('[P0] calls deleteMany with the correct where clause', async () => {
    mockArtifactDeleteMany.mockResolvedValue({ count: 0 });
    await DELETE(makeRequest({ repoConnectionId: 'conn_xyz' }));
    expect(mockArtifactDeleteMany).toHaveBeenCalledWith({ where: { repoConnectionId: 'conn_xyz' } });
  });

  it('[P0] returns 404 in production', async () => {
    const prev = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await DELETE(makeRequest({ repoConnectionId: 'c' }));
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prev, configurable: true });
  });
});
