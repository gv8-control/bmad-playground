import { StreamingModule } from '../../src/streaming/streaming.module';
import { SessionEventsService } from '../../src/streaming/session-events.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { CredentialsService } from '../../src/credentials/credentials.service';
import { DAYTONA_CLIENT } from '../../src/sandbox/daytona-client.provider';
import { buildTestModule } from '../helpers/test-module-builder';
import { SignJWT } from 'jose';
import http from 'http';

/**
 * NFR-R4: 10 concurrent SSE connections per browser session without starvation.
 *
 * This integration test covers the SERVER-SIDE behavior: NestJS must handle
 * 10 concurrent SSE streams without resource contention, event loss, or
 * starvation across conversations. Events from one conversation must not leak
 * into another (isolation).
 *
 * The Playwright E2E test at playwright/e2e/multi-conn/concurrent-sse.spec.ts
 * covers the browser-side HTTP/1.1 ceiling. This test covers the server side
 * through the full NestJS module wiring (StreamingModule + PrismaModule),
 * real HTTP server, boundary JWT verification, and SessionEventsService event
 * emission.
 */
describe('SSE concurrent connections (integration)', () => {
  let sessionEvents: SessionEventsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let port: number;
  const originalEnv = process.env;
  const conversations: Array<{ id: string; userId: string }> = [];
  let openConnections: Array<{ req: http.ClientRequest }> = [];

  beforeEach(async () => {
    process.env = { ...originalEnv, AUTH_SECRET: 'test-secret-for-jwt-1234567890' };

    conversations.length = 0;
    for (let i = 1; i <= 10; i++) {
      conversations.push({ id: `conv-${i}`, userId: 'user-1' });
    }

    const mockPrisma = {
      conversation: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string; userId: string } }) => {
          const conv = conversations.find((c) => c.id === where.id && c.userId === where.userId);
          return Promise.resolve(conv ? { id: conv.id } : null);
        }),
      },
      costRecord: {
        create: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: 0 } }),
      },
      oAuthCredential: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      turn: {
        create: jest.fn().mockResolvedValue({ id: 'turn-1' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Test User',
          email: 'test@example.com',
          githubLogin: 'testuser',
        }),
      },
      repoConnection: {
        findUnique: jest.fn().mockResolvedValue({ repoUrl: 'https://github.com/test/repo.git' }),
      },
    };

    const { module } = await buildTestModule(
      [StreamingModule, PrismaModule],
      [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DAYTONA_CLIENT, useValue: null },
        {
          provide: CredentialsService,
          useValue: { resolveOAuthToken: jest.fn().mockResolvedValue('fake-token') },
        },
      ],
    );

    sessionEvents = module.get(SessionEventsService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);
    const server = app.getHttpServer();
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 3001;
  });

  afterEach(async () => {
    for (const conn of openConnections) {
      try {
        conn.req.destroy();
      } catch {
        // connection already closed
      }
    }
    openConnections = [];
    if (app) {
      await app.close();
    }
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  async function mintToken(userId: string): Promise<string> {
    return new SignJWT({ userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('bmad-easy:boundary')
      .setAudience('bmad-easy:agent-be')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  }

  interface ParsedSseEvent {
    event: string;
    data: unknown;
  }

  function openSseConnection(
    conversationId: string,
    token: string,
  ): {
    events: ParsedSseEvent[];
    req: http.ClientRequest;
    ready: Promise<void>;
  } {
    const events: ParsedSseEvent[] = [];
    let resolveReady!: () => void;
    let rejectReady!: (err: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const req = http.get(
      `http://localhost:${port}/api/conversations/${conversationId}/events?token=${token}`,
      (res) => {
        if (res.statusCode !== 200) {
          rejectReady(
            new Error(`Expected status 200 for ${conversationId}, got ${res.statusCode}`),
          );
          return;
        }
        resolveReady();

        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            if (part.startsWith(':')) continue;
            const lines = part.split('\n');
            let eventName: string | null = null;
            let data: string | null = null;
            for (const line of lines) {
              if (line.startsWith('event: ')) eventName = line.slice(7);
              else if (line.startsWith('data: ')) data = line.slice(6);
            }
            if (eventName && data) {
              try {
                events.push({ event: eventName, data: JSON.parse(data) });
              } catch {
                // ignore JSON parse errors for partial data
              }
            }
          }
        });
      },
    );
    req.on('error', (err) => {
      rejectReady(err);
    });

    const conn = { events, req, ready };
    openConnections.push(conn);
    return conn;
  }

  /**
   * Polls until `condition` returns true or the timeout elapses.
   * Replaces fixed `setTimeout` waits with deterministic condition-based
   * polling — the test proceeds as soon as the expected state is reached
   * rather than waiting a fixed duration regardless.
   */
  async function waitForCondition(
    condition: () => boolean,
    timeoutMs = 5000,
    intervalMs = 50,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    // Final check before throwing — gives the caller a clear assertion failure
    // rather than a generic timeout error.
    if (!condition()) {
      throw new Error(`waitForCondition timed out after ${timeoutMs}ms`);
    }
  }

  it('[P0] handles 10 concurrent SSE connections without starvation (NFR-R4)', async () => {
    const tokens = await Promise.all(conversations.map((c) => mintToken(c.userId)));

    const connections = await Promise.all(
      conversations.map((c, i) => openSseConnection(c.id, tokens[i])),
    );

    await Promise.all(connections.map((c) => c.ready));

    for (const conv of conversations) {
      sessionEvents.emit(conv.id, { event: 'TEST_EVENT', data: { convId: conv.id } });
    }

    // Wait until every connection has received its TEST_EVENT — no fixed sleep.
    await waitForCondition(() =>
      connections.every((conn, i) =>
        conn.events.some(
          (e) =>
            e.event === 'TEST_EVENT' &&
            (e.data as { convId: string }).convId === conversations[i].id,
        ),
      ),
    );

    for (let i = 0; i < 10; i++) {
      const received = connections[i].events.filter(
        (e) =>
          e.event === 'TEST_EVENT' &&
          (e.data as { convId: string }).convId === conversations[i].id,
      );
      expect(received).toHaveLength(1);
    }

    for (const conn of connections) {
      conn.req.destroy();
    }
  });

  it('[P0] events from one conversation do not leak into another (isolation)', async () => {
    const tokens = await Promise.all(conversations.map((c) => mintToken(c.userId)));

    const connections = await Promise.all(
      conversations.map((c, i) => openSseConnection(c.id, tokens[i])),
    );

    await Promise.all(connections.map((c) => c.ready));

    sessionEvents.emit(conversations[0].id, {
      event: 'ISOLATION_TEST',
      data: { unique: 'leak-check' },
    });

    // Wait until connection 0 has received the ISOLATION_TEST event — no fixed sleep.
    await waitForCondition(() =>
      connections[0].events.some((e) => e.event === 'ISOLATION_TEST'),
    );

    const received0 = connections[0].events.filter((e) => e.event === 'ISOLATION_TEST');
    expect(received0).toHaveLength(1);

    for (let i = 1; i < 10; i++) {
      const leaked = connections[i].events.filter((e) => e.event === 'ISOLATION_TEST');
      expect(leaked).toHaveLength(0);
    }

    for (const conn of connections) {
      conn.req.destroy();
    }
  });
});
