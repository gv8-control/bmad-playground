import { Controller, Get, Logger, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { SessionEventsService, type SseEvent } from './session-events.service';
import { jwtVerify } from 'jose';
import { PrismaService } from '../prisma/prisma.service';

interface MessageEvent {
  data: string;
  id?: string;
  type?: string;
  retry?: number;
}

@Controller('conversations/:id/events')
export class StreamingController {
  private readonly logger = new Logger(StreamingController.name);

  constructor(
    private readonly sessionEvents: SessionEventsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async stream(
    @Param('id') conversationId: string,
    @Query('token') token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const jwtToken = token ?? this.extractBearerToken(req);
    if (!jwtToken) {
      res.status(401).json({ code: 'Unauthorized', message: 'Missing boundary JWT' });
      return;
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      res.status(500).json({ code: 'InternalServerError', message: 'AUTH_SECRET is not configured' });
      return;
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(
        jwtToken,
        new TextEncoder().encode(secret),
        { issuer: 'bmad-easy:boundary', audience: 'bmad-easy:agent-be' },
      );
      const jwtPayload = payload as unknown as { userId?: string };
      if (!jwtPayload.userId) {
        res.status(401).json({ code: 'Unauthorized', message: 'Invalid boundary JWT payload' });
        return;
      }
      userId = jwtPayload.userId;
    } catch {
      res.status(401).json({ code: 'Unauthorized', message: 'Invalid or expired boundary JWT' });
      return;
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conversation) {
      res.status(403).json({ code: 'Forbidden', message: 'Conversation not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.flushHeaders?.();

    const stream$: Observable<SseEvent> = this.sessionEvents.getEventStream(conversationId);

    let pendingCount = 0;
    let backPressureTimer: NodeJS.Timeout | null = null;

    const cleanupBackPressure = () => {
      if (backPressureTimer) {
        clearTimeout(backPressureTimer);
        backPressureTimer = null;
      }
    };

    const heartbeatInterval = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeatInterval);
      }
    }, 15_000);
    heartbeatInterval.unref?.();

    const cleanupHeartbeat = () => {
      clearInterval(heartbeatInterval);
    };

    const cleanupAll = () => {
      cleanupBackPressure();
      cleanupHeartbeat();
    };

    const subscription = stream$.subscribe({
      next: (event: SseEvent) => {
        const messageEvent: MessageEvent = {
          data: JSON.stringify(event.data),
          type: event.event,
        };
        const wrote1 = res.write(`event: ${messageEvent.type}\n`);
        const wrote2 = res.write(`data: ${messageEvent.data}\n\n`);

        if (!wrote1 || !wrote2) {
          pendingCount++;
          if (pendingCount >= 200 && !backPressureTimer) {
            backPressureTimer = setTimeout(() => {
              if (pendingCount >= 200) {
                cleanupAll();
                subscription.unsubscribe();
                res.write('event: STREAM_ERROR\n');
                res.write(`data: ${JSON.stringify({ code: 'STREAM_BACK_PRESSURE' })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
              } else {
                backPressureTimer = null;
              }
            }, 30_000);
            backPressureTimer.unref?.();
          }
        }
      },
      complete: () => {
        cleanupAll();
        try {
          res.end();
        } catch {
          // response already closed
        }
      },
      error: (err: unknown) => {
        this.logger.error(`SSE stream error for conversation ${conversationId}: ${err}`);
        cleanupAll();
        try {
          res.end();
        } catch {
          // response already closed
        }
      },
    });

    res.on('drain', () => {
      pendingCount = 0;
      cleanupBackPressure();
    });

    req.on('close', () => {
      cleanupAll();
      subscription.unsubscribe();
    });
  }

  private extractBearerToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return undefined;
  }
}
