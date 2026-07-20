/**
 * @jest-environment node
 *
 * Unit tests for the internal test helper route:
 *   POST   /api/internal/test/conversations — seeds Conversation rows for a user
 *   DELETE /api/internal/test/conversations — removes all Conversation rows for a user
 *
 * This route is test infrastructure used by E2E fixtures. It must be
 * non-functional in production (return 404).
 *
 * The POST handler has non-trivial branching: when a conversation entry
 * includes a custom `id`, it uses `upsert` (so re-seeding with the same ID
 * doesn't trip a unique-constraint error); otherwise it uses `create` with
 * an auto-generated cuid. These tests verify that branching behavior.
 */

const mockConversationUpsert = jest.fn();
const mockConversationCreate = jest.fn();
const mockConversationDeleteMany = jest.fn();
const mock$Transaction = jest.fn();

jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    conversation: {
      upsert: mockConversationUpsert,
      create: mockConversationCreate,
      deleteMany: mockConversationDeleteMany,
    },
    $transaction: mock$Transaction,
  }),
}));

import { POST, DELETE } from './route';

function makeRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

describe('POST /api/internal/test/conversations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] creates conversations and returns 200 with ids', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'conv_1' }, { id: 'conv_2' }]);
    const res = await POST(
      makeRequest({
        userId: 'usr_1',
        conversations: [
          { title: 'First' },
          { title: 'Second' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ids: ['conv_1', 'conv_2'] });
  });

  it('[P0] returns 404 in production without test-endpoint bypass', async () => {
    const prevEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await POST(
      makeRequest({ userId: 'usr_1', conversations: [] }),
    );
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prevEnv, configurable: true });
  });

  it('[P0] returns 404 when TEST_ENV is unset', async () => {
    delete process.env.TEST_ENV;
    const res = await POST(makeRequest({ userId: 'usr_1', conversations: [] }));
    expect(res.status).toBe(404);
  });

  it('[P1] uses upsert when a custom id is provided', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'custom_1' }]);
    await POST(
      makeRequest({
        userId: 'usr_1',
        conversations: [{ id: 'custom_1', title: 'Seeded' }],
      }),
    );
    expect(mockConversationUpsert).toHaveBeenCalledTimes(1);
    expect(mockConversationCreate).not.toHaveBeenCalled();
    expect(mockConversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'custom_1' },
        create: expect.objectContaining({ id: 'custom_1', userId: 'usr_1', title: 'Seeded' }),
      }),
    );
  });

  it('[P1] uses create when no custom id is provided', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'auto_1' }]);
    await POST(
      makeRequest({
        userId: 'usr_1',
        conversations: [{ title: 'Auto' }],
      }),
    );
    expect(mockConversationCreate).toHaveBeenCalledTimes(1);
    expect(mockConversationUpsert).not.toHaveBeenCalled();
    expect(mockConversationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'usr_1', title: 'Auto' }),
    });
  });

  it('[P1] mixes upsert and create within the same batch', async () => {
    mock$Transaction.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await POST(
      makeRequest({
        userId: 'usr_1',
        conversations: [
          { id: 'fixed', title: 'With ID' },
          { title: 'Without ID' },
        ],
      }),
    );
    expect(mockConversationUpsert).toHaveBeenCalledTimes(1);
    expect(mockConversationCreate).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/internal/test/conversations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] deletes conversations by userId and returns { ok: true }', async () => {
    mockConversationDeleteMany.mockResolvedValue({ count: 2 });
    const res = await DELETE(makeRequest({ userId: 'usr_1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('[P0] returns 400 when userId is missing', async () => {
    const res = await DELETE(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('[P0] returns 404 in production without test-endpoint bypass', async () => {
    const prevEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    const res = await DELETE(makeRequest({ userId: 'usr_1' }));
    expect(res.status).toBe(404);
    Object.defineProperty(process.env, 'NODE_ENV', { value: prevEnv, configurable: true });
  });
});
