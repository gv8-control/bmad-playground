/**
 * @jest-environment node
 *
 * Unit tests for the internal test helper route:
 *   POST   /api/internal/test/conversations/[id]/turns — seeds Turn rows
 *   DELETE /api/internal/test/conversations/[id]/turns — removes all Turn rows
 *
 * This route is test infrastructure used by E2E fixtures. It must be
 * non-functional in production (return 404).
 *
 * The POST handler has two non-trivial branches worth logic-testing:
 *   1. `segments` is conditionally spread into the Prisma `data` via a loose
 *      `!= null` check — omitted/undefined and explicit `null` both omit the
 *      field; a real JSON value includes it.
 *   2. `createdAt` falls back to `new Date()` when omitted.
 */

const mockTurnCreate = jest.fn();
const mockTurnDeleteMany = jest.fn();
const mock$Transaction = jest.fn();

jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    turn: {
      create: mockTurnCreate,
      deleteMany: mockTurnDeleteMany,
    },
    $transaction: mock$Transaction,
  }),
}));

import { POST, DELETE } from './route';

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/internal/test/conversations/[id]/turns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] creates turns and returns 200 with ids', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'turn_1' }, { id: 'turn_2' }]);
    const res = await POST(
      makeRequest({
        turns: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ],
      }),
      makeParams('conv_1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ids: ['turn_1', 'turn_2'] });
  });

  it('[P0] returns 400 when turns is missing', async () => {
    const res = await POST(makeRequest({}), makeParams('conv_1'));
    expect(res.status).toBe(400);
  });

  it('[P0] returns 404 in production without test-endpoint bypass', async () => {
    const prevEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await POST(
      makeRequest({ turns: [{ role: 'user', content: 'x' }] }),
      makeParams('conv_1'),
    );
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prevEnv, configurable: true });
  });

  it('[P0] returns 404 when TEST_ENV is unset', async () => {
    delete process.env.TEST_ENV;
    const res = await POST(
      makeRequest({ turns: [{ role: 'user', content: 'x' }] }),
      makeParams('conv_1'),
    );
    expect(res.status).toBe(404);
  });

  it('[P1] omits segments from Prisma data when segments is undefined', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'turn_1' }]);
    await POST(
      makeRequest({
        turns: [{ role: 'user', content: 'hello' }],
      }),
      makeParams('conv_1'),
    );
    expect(mockTurnCreate).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ segments: expect.anything() }),
    });
  });

  it('[P1] omits segments from Prisma data when segments is explicit null', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'turn_1' }]);
    await POST(
      makeRequest({
        turns: [{ role: 'user', content: 'hello', segments: null }],
      }),
      makeParams('conv_1'),
    );
    expect(mockTurnCreate).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ segments: expect.anything() }),
    });
  });

  it('[P1] includes segments in Prisma data when segments is a JSON object', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'turn_1' }]);
    const segments = { tokens: 42, model: 'gpt-4' };
    await POST(
      makeRequest({
        turns: [{ role: 'assistant', content: 'hi', segments }],
      }),
      makeParams('conv_1'),
    );
    expect(mockTurnCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ segments }),
    });
  });

  it('[P1] falls back to new Date() for createdAt when omitted', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'turn_1' }]);
    await POST(
      makeRequest({
        turns: [{ role: 'user', content: 'hello' }],
      }),
      makeParams('conv_1'),
    );
    expect(mockTurnCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdAt: expect.any(Date) }),
    });
  });
});

describe('DELETE /api/internal/test/conversations/[id]/turns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] deletes turns by conversationId and returns { ok: true }', async () => {
    mockTurnDeleteMany.mockResolvedValue({ count: 3 });
    const res = await DELETE({} as Request, makeParams('conv_1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('[P0] returns 404 in production without test-endpoint bypass', async () => {
    const prevEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await DELETE({} as Request, makeParams('conv_1'));
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prevEnv, configurable: true });
  });
});
