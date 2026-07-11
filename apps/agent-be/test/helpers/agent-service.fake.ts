import { Inject, Injectable } from '@nestjs/common';
import type { IAgentService, AgentRunParams } from '@bmad-easy/shared-types';
import type { AccessDeniedCode } from '@bmad-easy/shared-types';
import type { SseEvent } from '../../src/streaming/session-events.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { ISandboxService } from '@bmad-easy/shared-types';
import { SANDBOX_SERVICE } from '@bmad-easy/shared-types';
import { SessionEventsService } from '../../src/streaming/session-events.service';
import { EventType } from '@ag-ui/core';

const DEFAULT_SCRIPT: SseEvent[] = [
  { event: EventType.RUN_STARTED, data: {} },
  { event: EventType.TEXT_MESSAGE_START, data: { messageId: 'msg-1', role: 'assistant' } },
  { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Hello' } },
  { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: ' world' } },
  { event: EventType.TEXT_MESSAGE_END, data: { messageId: 'msg-1' } },
  { event: EventType.RUN_FINISHED, data: {} },
];

const FILE_MODIFYING_TOOLS = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

@Injectable()
export class AgentServiceFake implements IAgentService {
  private streamDelay = 0;
  private script: SseEvent[] = DEFAULT_SCRIPT;
  private shouldFailNextRun = false;
  private activeRun = false;

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

  setToolCallScript(
    toolName: string,
    input: string,
    output: string,
    promoted?: { artifactType: string; artifactTitle: string; viewHref: string },
    credentialFailure?: boolean,
    accessDenied?: { code: AccessDeniedCode; retryAfter?: number },
  ): void {
    const toolCallId = `tc-${Date.now()}`;
    const events: SseEvent[] = [
      { event: EventType.RUN_STARTED, data: {} },
      { event: EventType.TOOL_CALL_START, data: { toolCallId, toolCallName: toolName, parentMessageId: null } },
      { event: EventType.TOOL_CALL_ARGS, data: { toolCallId, delta: input } },
      { event: EventType.TOOL_CALL_END, data: { toolCallId } },
      { event: EventType.TOOL_CALL_RESULT, data: { messageId: toolCallId, toolCallId, content: output, role: 'tool' } },
    ];
    if (credentialFailure) {
      events.push({
        event: 'CREDENTIAL_FAILURE',
        data: { type: 'CREDENTIAL_FAILURE', toolCallId },
      });
    } else if (accessDenied) {
      events.push({
        event: 'ACCESS_DENIED',
        data: { type: 'ACCESS_DENIED', toolCallId, code: accessDenied.code, retryAfter: accessDenied.retryAfter },
      });
    } else if (promoted) {
      events.push({
        event: 'TOOL_CALL_PROMOTED',
        data: { type: 'TOOL_CALL_PROMOTED', toolCallId, artifactId: null, ...promoted },
      });
    }
    events.push({ event: EventType.RUN_FINISHED, data: {} });
    this.script = events;
  }

  setCircuitBreakerScript(): void {
    this.script = [{ event: EventType.RUN_STARTED, data: {} }];
  }

  failNextRun(): void {
    this.shouldFailNextRun = true;
  }

  setActiveRun(active: boolean): void {
    this.activeRun = active;
  }

  async runTurn(params: AgentRunParams): Promise<void> {
    this.activeRun = true;

    if (this.shouldFailNextRun) {
      this.shouldFailNextRun = false;
      this.sessionEvents.emit(params.conversationId, {
        event: EventType.RUN_ERROR,
        data: { message: 'AgentServiceFake: simulated run failure' },
      });
      this.activeRun = false;
      return;
    }

    let accumulatedText = '';
    let currentToolName: string | null = null;

    for (const event of this.script) {
      if (event.event === EventType.TEXT_MESSAGE_CONTENT) {
        const delta = (event.data as { delta?: string }).delta ?? '';
        accumulatedText += delta;
      }

      if (event.event === EventType.TOOL_CALL_START) {
        currentToolName = (event.data as { toolCallName?: string }).toolCallName ?? null;
      }

      this.sessionEvents.emit(params.conversationId, event);

      if (event.event === EventType.TOOL_CALL_RESULT && currentToolName && FILE_MODIFYING_TOOLS.has(currentToolName)) {
        try {
          const status = await this.sandboxService.getWorkingTreeStatus(params.sandboxId);
          if (status.dirty) {
            this.sessionEvents.emit(params.conversationId, {
              event: 'WORKING_TREE_DIRTY',
              data: { files: status.files },
            });
          } else {
            this.sessionEvents.emit(params.conversationId, {
              event: 'WORKING_TREE_CLEAN',
              data: {},
            });
          }
        } catch {
          // working tree check failure does not crash the fake run
        }
      }

      if (this.streamDelay > 0) {
        await new Promise((r) => setTimeout(r, this.streamDelay));
      }
    }

    const hasRunFinished = this.script.some((e) => e.event === EventType.RUN_FINISHED);
    const hasRunError = this.script.some((e) => e.event === EventType.RUN_ERROR);

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
    this.sessionEvents.emit(conversationId, {
      event: EventType.RUN_FINISHED,
      data: {},
    });

    this.activeRun = false;
  }

  isIdle(_conversationId: string): boolean {
    return !this.activeRun;
  }
}
