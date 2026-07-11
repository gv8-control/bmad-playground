/**
 * Story 3.1: Provision a Sandbox When Opening a Conversation
 * Unit tests for StreamingController.
 *
 * Covers: AC-1 (SSE lifecycle events), AC-5 (client-side timeout via SSE).
 */
import { Test } from '@nestjs/testing';
import { StreamingController } from './streaming.controller';
import { SessionEventsService } from './session-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignJWT } from 'jose';
import { EventType } from '@ag-ui/core';

describe('StreamingController', () => {
  let controller: StreamingController;
  let sessionEvents: SessionEventsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, AUTH_SECRET: 'test-secret-for-jwt-1234567890' };

    mockPrisma = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1' }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StreamingController],
      providers: [
        SessionEventsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = moduleRef.get(StreamingController);
    sessionEvents = moduleRef.get(SessionEventsService);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  async function mintToken(): Promise<string> {
    return new SignJWT({ userId: 'user-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('bmad-easy:boundary')
      .setAudience('bmad-easy:agent-be')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  }

  function mockResponse(): {
    res: Record<string, unknown>;
    written: string[];
  } {
    const written: string[] = [];
    const headers: Record<string, string> = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn((key: string, value: string) => {
        headers[key] = value;
      }),
      flushHeaders: jest.fn(),
      write: jest.fn((data: string) => {
        written.push(data);
        return true;
      }),
      end: jest.fn(),
      on: jest.fn(),
      headers,
    };
    return { res, written };
  }

  describe('[P0] stream', () => {
    it('returns 401 when no token is provided', async () => {
      const { res } = mockResponse();
      await controller.stream('conv-1', undefined, { headers: {} } as never, res as never);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 for an invalid token', async () => {
      const { res } = mockResponse();
      await controller.stream('conv-1', 'invalid-token', { headers: {} } as never, res as never);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('[P0] returns 403 when the conversation does not belong to the JWT user', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      const { res } = mockResponse();
      const token = await mintToken();
      await controller.stream('conv-other', token, { on: jest.fn(), headers: {} } as never, res as never);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('sets SSE headers for a valid token', async () => {
      const { res } = mockResponse();
      const token = await mintToken();
      await controller.stream('conv-1', token, { on: jest.fn(), headers: {} } as never, res as never);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('emits SESSION_READY event when sessionEvents.emit() is called', async () => {
      const { res, written } = mockResponse();
      const token = await mintToken();
      await controller.stream('conv-1', token, { on: jest.fn(), headers: {} } as never, res as never);

      sessionEvents.emit('conv-1', { event: 'SESSION_READY', data: { sandboxId: 'sb-1' } });

      const output = written.join('');
      expect(output).toContain('SESSION_READY');
      expect(output).toContain('sb-1');
    });
  });

  describe('[P0] Story 3.3 — SSE Back-pressure (NFR-R3)', () => {
    function mockResponseWithBackPressure(): {
      res: Record<string, unknown>;
      written: string[];
      setWriteReturn: (returnValue: boolean) => void;
      emitDrain: () => void;
    } {
      const written: string[] = [];
      const headers: Record<string, string> = {};
      let writeReturn = true;
      const drainListeners: Array<() => void> = [];

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn((key: string, value: string) => {
          headers[key] = value;
        }),
        flushHeaders: jest.fn(),
        write: jest.fn((data: string) => {
          written.push(data);
          return writeReturn;
        }),
        end: jest.fn(),
        on: jest.fn((event: string, listener: () => void) => {
          if (event === 'drain') drainListeners.push(listener);
        }),
        headers,
      };

      return {
        res,
        written,
        setWriteReturn: (returnValue: boolean) => {
          writeReturn = returnValue;
        },
        emitDrain: () => {
          for (const listener of drainListeners) listener();
        },
      };
    }

    it('[P0] emits STREAM_ERROR when queue reaches 200 and does not drain in 30s', async () => {
      const { res, written, setWriteReturn } = mockResponseWithBackPressure();
      const token = await mintToken();

      jest.useFakeTimers();

      await controller.stream('conv-1', token, { on: jest.fn(), headers: {} } as never, res as never);

      setWriteReturn(false);

      for (let i = 0; i < 200; i++) {
        sessionEvents.emit('conv-1', { event: EventType.TEXT_MESSAGE_CONTENT, data: { delta: 'x' } });
      }

      jest.advanceTimersByTime(31_000);

      const output = written.join('');
      expect(output).toContain('STREAM_ERROR');
      expect(output).toContain('STREAM_BACK_PRESSURE');
      expect(output).toContain('[DONE]');

      jest.useRealTimers();
    });

    it('[P0] connection stays open when queue drains before 30s timeout', async () => {
      const { res, setWriteReturn, emitDrain } = mockResponseWithBackPressure();
      const token = await mintToken();

      jest.useFakeTimers();

      await controller.stream('conv-1', token, { on: jest.fn(), headers: {} } as never, res as never);

      setWriteReturn(false);

      for (let i = 0; i < 200; i++) {
        sessionEvents.emit('conv-1', { event: EventType.TEXT_MESSAGE_CONTENT, data: { delta: 'x' } });
      }

      setWriteReturn(true);
      emitDrain();

      jest.advanceTimersByTime(31_000);

      expect(res.end).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('[P1] timer cleared on drain', async () => {
      const { res, setWriteReturn, emitDrain } = mockResponseWithBackPressure();
      const token = await mintToken();

      jest.useFakeTimers();

      await controller.stream('conv-1', token, { on: jest.fn(), headers: {} } as never, res as never);

      setWriteReturn(false);

      for (let i = 0; i < 200; i++) {
        sessionEvents.emit('conv-1', { event: EventType.TEXT_MESSAGE_CONTENT, data: { delta: 'x' } });
      }

      setWriteReturn(true);
      emitDrain();

      setWriteReturn(false);

      for (let i = 0; i < 200; i++) {
        sessionEvents.emit('conv-1', { event: EventType.TEXT_MESSAGE_CONTENT, data: { delta: 'x' } });
      }

      jest.advanceTimersByTime(31_000);

      expect(res.end).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('[P1] timer cleared on req close (client disconnects while back-pressure timer running)', async () => {
      const { res, setWriteReturn } = mockResponseWithBackPressure();
      const token = await mintToken();

      jest.useFakeTimers();

      // Wrapper ref so TS control-flow analysis on the closure-captured `let`
      // doesn't narrow it to `never` at the call site below. Direct `let`
      // assignment inside the jest.fn callback is treated as "may or may not
      // have run" — TS narrows to `null`, and `if (closeHandler)` then narrows
      // to `never`.
      const closeHandlerRef: { current: (() => void) | null } = { current: null };
      await controller.stream(
        'conv-1',
        token,
        { on: jest.fn((event: string, handler: () => void) => { if (event === 'close') closeHandlerRef.current = handler; }), headers: {} } as never,
        res as never,
      );

      setWriteReturn(false);

      for (let i = 0; i < 200; i++) {
        sessionEvents.emit('conv-1', { event: EventType.TEXT_MESSAGE_CONTENT, data: { delta: 'x' } });
      }

      if (closeHandlerRef.current) closeHandlerRef.current();

      jest.advanceTimersByTime(31_000);

      expect(res.end).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('[P0] Story 3.4 — SSE Heartbeat (AC-5)', () => {
    it('[P0] writes heartbeat comment on 15s interval', async () => {
      const { res, written } = mockResponse();
      const token = await mintToken();

      jest.useFakeTimers();

      await controller.stream('conv-1', token, { on: jest.fn(), headers: {} } as never, res as never);

      written.length = 0;

      jest.advanceTimersByTime(15_000);

      expect(written).toContain(': heartbeat\n\n');

      jest.useRealTimers();
    });

    it('[P0] clears heartbeat on connection close', async () => {
      const { res, written } = mockResponse();
      const token = await mintToken();

      jest.useFakeTimers();

      // Wrapper ref — see above test for why this avoids the `never` narrowing.
      const closeHandlerRef: { current: (() => void) | null } = { current: null };
      await controller.stream(
        'conv-1',
        token,
        { on: jest.fn((event: string, handler: () => void) => { if (event === 'close') closeHandlerRef.current = handler; }), headers: {} } as never,
        res as never,
      );

      if (closeHandlerRef.current) closeHandlerRef.current();
      written.length = 0;

      jest.advanceTimersByTime(30_000);

      expect(written).not.toContain(': heartbeat\n\n');

      jest.useRealTimers();
    });

    it('[P0] clears heartbeat on stream complete', async () => {
      const { res, written } = mockResponse();
      const token = await mintToken();

      jest.useFakeTimers();

      await controller.stream('conv-1', token, { on: jest.fn(), headers: {} } as never, res as never);

      sessionEvents.complete('conv-1');

      written.length = 0;

      jest.advanceTimersByTime(30_000);

      expect(written).not.toContain(': heartbeat\n\n');

      jest.useRealTimers();
    });

    it('[P1] clears heartbeat on stream error', async () => {
      const { res, written } = mockResponse();
      const token = await mintToken();

      jest.useFakeTimers();

      await controller.stream('conv-1', token, { on: jest.fn(), headers: {} } as never, res as never);

      const subject = sessionEvents.getEventStream('conv-1') as unknown as {
        error: (err: unknown) => void;
      };
      subject.error(new Error('stream error'));

      written.length = 0;

      jest.advanceTimersByTime(30_000);

      expect(written).not.toContain(': heartbeat\n\n');

      jest.useRealTimers();
    });

    it('[P1] heartbeat write failure does not crash', async () => {
      const written: string[] = [];
      const headers: Record<string, string> = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn((key: string, value: string) => {
          headers[key] = value;
        }),
        flushHeaders: jest.fn(),
        write: jest.fn((data: string) => {
          if (data.startsWith(': heartbeat')) throw new Error('write EPIPE');
          written.push(data);
          return true;
        }),
        end: jest.fn(),
        on: jest.fn(),
        headers,
      };

      const token = await mintToken();

      jest.useFakeTimers();

      await controller.stream('conv-1', token, { on: jest.fn(), headers: {} } as never, res as never);

      jest.advanceTimersByTime(15_000);

      expect(res.end).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
