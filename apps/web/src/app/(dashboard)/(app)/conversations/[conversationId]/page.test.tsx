/**
 * @jest-environment node
 *
 * Story 3.2: Invoke BMAD Skills via Slash Command
 * Server Component unit tests for ConversationPage.
 * Covers AC-4 (URL transition target page, conversation lookup, tenant isolation).
 *
 * The page reads a conversation from Postgres by id + userId (tenant isolation),
 * redirects to /sign-in if unauthenticated, redirects to /conversations/new
 * if the conversation doesn't exist or doesn't belong to the user, mints a
 * boundary JWT, and renders ConversationPane with initialConversationId.
 *
 * Child component rendering (ConversationPane, Breadcrumb) is verified by
 * their own co-located component tests. This page test focuses on
 * data-fetching decisions and redirect logic. Child components are mocked
 * as render stubs to isolate the page test from their internal logic.
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockConversationFindFirst = jest.fn();
const mockTurnFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    conversation: { findFirst: mockConversationFindFirst },
    turn: { findMany: mockTurnFindMany },
  }),
}));

const mockMintBoundaryJwt = jest.fn();
jest.mock('@/lib/boundary-jwt', () => ({
  mintBoundaryJwt: (...args: unknown[]) => mockMintBoundaryJwt(...args),
}));

jest.mock('@/components/shell/Breadcrumb', () => ({
  Breadcrumb: () => 'Breadcrumb',
}));

jest.mock('@/components/conversation/ConversationPane', () => ({
  ConversationPane: ({
    boundaryJwt,
    apiUrl,
    initialConversationId,
    initialMessages,
  }: {
    boundaryJwt: string;
    apiUrl: string;
    initialConversationId: string;
    initialMessages: Array<{ id: string; role: string; content: string }>;
  }) =>
    `ConversationPane:${boundaryJwt}:${apiUrl}:${initialConversationId}:${initialMessages.length}`,
}));

import { renderToStaticMarkup } from 'react-dom/server';
import ConversationPage from './page';

const SESSION = { userId: 'usr_abc123' };
const CONVERSATION = {
  id: 'conv-1',
  userId: 'usr_abc123',
  title: 'PRD Discussion',
};
const BOUNDARY_JWT = 'boundary-jwt-token';
const API_URL = 'http://test-agent-be:3001';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.API_URL = API_URL;
});

afterEach(() => {
  delete process.env.API_URL;
});

describe('ConversationPage — auth and redirect (AC-4)', () => {
  it('[P0] redirects to /sign-in when no session', async () => {
    mockAuth.mockResolvedValue(null);

    await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });

    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('[P0] redirects to /sign-in when session has no userId', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });

    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('[P0] redirects to /conversations/new when conversation not found (tenant isolation)', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockConversationFindFirst.mockResolvedValue(null);

    await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-missing' }),
    });

    expect(mockConversationFindFirst).toHaveBeenCalledWith({
      where: { id: 'conv-missing', userId: 'usr_abc123' },
      select: { id: true, title: true },
    });
    expect(mockRedirect).toHaveBeenCalledWith('/conversations/new');
  });
});

describe('ConversationPage — conversation rendering (AC-4)', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(SESSION);
    mockConversationFindFirst.mockResolvedValue(CONVERSATION);
    mockTurnFindMany.mockResolvedValue([]);
    mockMintBoundaryJwt.mockResolvedValue(BOUNDARY_JWT);
  });

  it('[P0] queries conversation by id and userId via findFirst (tenant isolation)', async () => {
    await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });

    expect(mockConversationFindFirst).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'usr_abc123' },
      select: { id: true, title: true },
    });
  });

  it('[P0] mints a boundary JWT with the userId', async () => {
    await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });

    expect(mockMintBoundaryJwt).toHaveBeenCalledWith('usr_abc123');
  });

  it('[P0] renders the conversation title in an h1', async () => {
    const element = await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('PRD Discussion');
  });

  it('[P0] renders Breadcrumb', async () => {
    const element = await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Breadcrumb');
  });

  it('[P0] renders ConversationPane with boundaryJwt, apiUrl, and initialConversationId', async () => {
    const element = await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(
      `ConversationPane:${BOUNDARY_JWT}:${API_URL}:conv-1:0`,
    );
  });

  it('[P0] passes turns as initialMessages to ConversationPane', async () => {
    mockTurnFindMany.mockResolvedValue([
      { id: 'turn-1', role: 'user', content: 'hello', createdAt: new Date() },
      { id: 'turn-2', role: 'assistant', content: 'hi there', createdAt: new Date() },
    ]);

    const element = await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(
      `ConversationPane:${BOUNDARY_JWT}:${API_URL}:conv-1:2`,
    );
  });

  it('[P0] queries turns ordered by createdAt ascending', async () => {
    await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });

    expect(mockTurnFindMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, createdAt: true },
    });
  });

  it('[P1] falls back to "Conversation" h1 when title is null', async () => {
    mockConversationFindFirst.mockResolvedValue({
      id: 'conv-1',
      userId: 'usr_abc123',
      title: null,
    });

    const element = await ConversationPage({
      params: Promise.resolve({ conversationId: 'conv-1' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Conversation');
    expect(html).not.toContain('ConversationPane:undefined');
  });
});
