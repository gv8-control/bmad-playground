import { Inject, Injectable } from '@nestjs/common';
import type { IAgentService, AgentRunParams } from '@bmad-easy/shared-types';
import type { SseEvent } from '../../src/streaming/session-events.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { ISandboxService } from '@bmad-easy/shared-types';
import { SANDBOX_SERVICE } from '@bmad-easy/shared-types';
import { SessionEventsService } from '../../src/streaming/session-events.service';

const DEFAULT_SCRIPT: SseEvent[] = [
  { event: 'RUN_STARTED', data: {} },
  { event: 'TEXT_MESSAGE_START', data: { messageId: 'msg-1', role: 'assistant' } },
  { event: 'TEXT_MESSAGE_CONTENT', data: { messageId: 'msg-1', delta: 'Hello' } },
  { event: 'TEXT_MESSAGE_CONTENT', data: { messageId: 'msg-1', delta: ' world' } },
  { event: 'TEXT_MESSAGE_END', data: { messageId: 'msg-1' } },
  { event: 'RUN_FINISHED', data: {} },
];

@Injectable()
export class AgentServiceFake implements IAgentService {
  private streamDelay = 0;
  private script: SseEvent[] = DEFAULT_SCRIPT;
  private shouldFailNextRun = false;
  private activeRun = false;
  private readonly runParams = new Map<string, AgentRunParams>();

  constructor(
    private readonly sessionEvents: SessionEventsService,
    private readonly prisma: PrismaService,
    @Inject(SANDBOX_SERVICE) private readonly sandboxService: ISandboxService,
  ) {}

  setStreamDelay(ms: number): void {
    this.streamDelay = ms;
  }

  setScript(events: SseEvent[]): void {
    this.script = events;
  }

  failNextRun(): void {
    this.shouldFailNextRun = true;
  }

  setActiveRun(active: boolean): void {
    this.activeRun = active;
  }

  async runTurn(params: AgentRunParams): Promise<void> {
    this.runParams.set(params.conversationId, params);
    this.activeRun = true;

    if (this.shouldFailNextRun) {
      this.shouldFailNextRun = false;
      this.sessionEvents.emit(params.conversationId, {
        event: 'RUN_ERROR',
        data: { message: 'AgentServiceFake: simulated run failure' },
      });
      this.activeRun = false;
      return;
    }

    let accumulatedText = '';

    for (const event of this.script) {
      if (event.event === 'TEXT_MESSAGE_CONTENT') {
        const delta = (event.data as { delta?: string }).delta ?? '';
        accumulatedText += delta;
      }

      this.sessionEvents.emit(params.conversationId, event);

      if (this.streamDelay > 0) {
        await new Promise((r) => setTimeout(r, this.streamDelay));
      }
    }

    const hasRunFinished = this.script.some((e) => e.event === 'RUN_FINISHED');
    const hasRunError = this.script.some((e) => e.event === 'RUN_ERROR');

    if (hasRunFinished && !hasRunError && accumulatedText.length > 0) {
      await this.prisma.turn.create({
        data: {
          conversationId: params.conversationId,
          role: 'assistant',
          content: accumulatedText,
        },
      });
      await this.prisma.conversation.update({
        where: { id: params.conversationId },
        data: { lastActiveAt: new Date() },
      });
    }

    this.activeRun = false;
  }

  async stop(conversationId: string): Promise<void> {
    const params = this.runParams.get(conversationId);
    if (params) {
      await this.sandboxService.terminateProcess(params.sandboxId, 'agent-process');
    }

    this.sessionEvents.emit(conversationId, {
      event: 'RUN_FINISHED',
      data: {},
    });

    this.activeRun = false;
  }
}
