import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { IAgentService, AgentRunParams } from '@bmad-easy/shared-types';
import { query, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ISandboxService } from '@bmad-easy/shared-types';
import { SANDBOX_SERVICE } from '@bmad-easy/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { SessionEventsService } from './session-events.service';

interface ActiveRun {
  sandboxId: string;
  processId: string;
  abortController: AbortController;
  query: Query;
}

@Injectable()
export class AgentService implements IAgentService, OnModuleDestroy {
  private readonly logger = new Logger(AgentService.name);
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly currentMessageIds = new Map<string, string>();

  constructor(
    @Inject(SANDBOX_SERVICE) private readonly sandboxService: ISandboxService,
    private readonly sessionEvents: SessionEventsService,
    private readonly prisma: PrismaService,
  ) {}

  async runTurn(params: AgentRunParams): Promise<void> {
    const { conversationId, sandboxId, message } = params;
    const processId = `agent-${conversationId}`;
    const abortController = new AbortController();

    this.sessionEvents.emit(conversationId, {
      event: 'RUN_STARTED',
      data: { threadId: conversationId },
    });

    let accumulatedText = '';

    try {
      const agentQuery = query({
        prompt: message,
        options: {
          cwd: process.env.AGENT_WORKDIR ?? '/workspace',
          abortController,
          env: {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
          },
        },
      });

      this.activeRuns.set(conversationId, {
        sandboxId,
        processId,
        abortController,
        query: agentQuery,
      });

      for await (const sdkMessage of agentQuery) {
        if (abortController.signal.aborted) break;
        accumulatedText += this.processSdkMessage(sdkMessage, conversationId);
      }

      if (!abortController.signal.aborted) {
        this.sessionEvents.emit(conversationId, {
          event: 'RUN_FINISHED',
          data: {},
        });

        if (accumulatedText.length > 0) {
          await this.prisma.turn.create({
            data: {
              conversationId,
              role: 'assistant',
              content: accumulatedText,
            },
            select: { id: true },
          });
          await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { lastActiveAt: new Date() },
            select: { id: true },
          });
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown agent error';
        this.logger.error(`Agent run failed for conversation ${conversationId}: ${errorMessage}`);
        this.sessionEvents.emit(conversationId, {
          event: 'RUN_ERROR',
          data: { message: errorMessage },
        });
      }
    } finally {
      this.currentMessageIds.delete(conversationId);
      this.activeRuns.delete(conversationId);
    }
  }

  async stop(conversationId: string): Promise<void> {
    const activeRun = this.activeRuns.get(conversationId);
    if (!activeRun) {
      return;
    }

    activeRun.abortController.abort();

    try {
      await activeRun.query.interrupt();
    } catch (err) {
      this.logger.warn(`Failed to interrupt agent query for conversation ${conversationId}: ${err}`);
    }

    try {
      await this.sandboxService.terminateProcess(activeRun.sandboxId, activeRun.processId);
    } catch (err) {
      this.logger.warn(
        `Failed to terminate process ${activeRun.processId} in sandbox ${activeRun.sandboxId}: ${err}`,
      );
    }

    this.sessionEvents.emit(conversationId, {
      event: 'RUN_FINISHED',
      data: {},
    });

    this.activeRuns.delete(conversationId);
    this.currentMessageIds.delete(conversationId);
  }

  onModuleDestroy() {
    for (const [conversationId, activeRun] of this.activeRuns) {
      activeRun.abortController.abort();
      this.logger.log(`Aborted agent run for conversation ${conversationId} on module destroy`);
    }
    this.activeRuns.clear();
    this.currentMessageIds.clear();
  }

  private processSdkMessage(sdkMessage: SDKMessage, conversationId: string): string {
    if (sdkMessage.type === 'stream_event') {
      return this.processStreamEvent(sdkMessage.event, conversationId);
    }
    if (sdkMessage.type === 'result') {
      return '';
    }
    if (sdkMessage.type === 'assistant') {
      return this.processAssistantMessage(sdkMessage, conversationId);
    }
    return '';
  }

  private processStreamEvent(event: unknown, conversationId: string): string {
    const e = event as { type: string; [key: string]: unknown };
    if (e.type === 'content_block_start') {
      const contentBlock = e.content_block as { type: string; id?: string; name?: string; text?: string };
      if (contentBlock.type === 'text') {
        const messageId = contentBlock.id ?? `msg-${Date.now()}`;
        this.currentMessageIds.set(conversationId, messageId);
        this.sessionEvents.emit(conversationId, {
          event: 'TEXT_MESSAGE_START',
          data: { messageId, role: 'assistant' },
        });
      } else if (contentBlock.type === 'tool_use') {
        const toolCallId = contentBlock.id ?? `tool-${Date.now()}`;
        const toolName = contentBlock.name ?? 'unknown';
        this.sessionEvents.emit(conversationId, {
          event: 'TOOL_CALL_START',
          data: { toolCallId, toolName, parentMessageId: null },
        });
      }
    } else if (e.type === 'content_block_delta') {
      const delta = e.delta as { type: string; text?: string; partial_json?: string };
      if (delta.type === 'text_delta' && delta.text) {
        const messageId = this.currentMessageIds.get(conversationId) ?? `msg-${Date.now()}`;
        this.sessionEvents.emit(conversationId, {
          event: 'TEXT_MESSAGE_CONTENT',
          data: { messageId, delta: delta.text },
        });
        return delta.text;
      }
    } else if (e.type === 'content_block_stop') {
      const messageId = this.currentMessageIds.get(conversationId) ?? `msg-${Date.now()}`;
      this.sessionEvents.emit(conversationId, {
        event: 'TEXT_MESSAGE_END',
        data: { messageId },
      });
    }
    return '';
  }

  private processAssistantMessage(_message: SDKMessage, _conversationId: string): string {
    return '';
  }
}
