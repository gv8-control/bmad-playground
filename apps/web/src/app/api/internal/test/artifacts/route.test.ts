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

const mockArtifactUpsert = jest.fn();
const mockArtifactDeleteMany = jest.fn();
const mock$Transaction = jest.fn();

jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    artifact: {
      upsert: mockArtifactUpsert,
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

  it('[P0] returns 404 in production without test-endpoint bypass', async () => {
    const prevEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await POST(
      makeRequest({ repoConnectionId: 'c', artifacts: [] }),
    );
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prevEnv, configurable: true });
  });

  it('[P0] returns 404 when TEST_ENV is unset', async () => {
    delete process.env.TEST_ENV;
    const res = await POST(makeRequest({ repoConnectionId: 'c', artifacts: [] }));
    expect(res.status).toBe(404);
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

  it('[P0] returns 404 in production without test-endpoint bypass', async () => {
    const prevEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await DELETE(makeRequest({ repoConnectionId: 'c' }));
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prevEnv, configurable: true });
  });
});
