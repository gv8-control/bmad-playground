import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { tmpdir } from 'os';
import type { IAgentService, AgentRunParams, MessageSegment } from '@bmad-easy/shared-types';
import { query, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { EventType } from '@ag-ui/core';
import type { ISandboxService } from '@bmad-easy/shared-types';
import { SANDBOX_SERVICE } from '@bmad-easy/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@bmad-easy/database-schemas';
import { SessionEventsService } from './session-events.service';
import { ToolPillClassifierService } from './tool-pill-classifier.service';
import { CostTrackingService } from '../cost-tracking/cost-tracking.service';

interface ActiveRun {
  sandboxId: string;
  abortController: AbortController;
  query: Query;
  userId: string;
}

interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  input: string;
}

const CIRCUIT_BREAKER_TIMEOUT_MS = (() => {
  const parsed = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS ?? '120000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
})();

const CIRCUIT_BREAKER_MESSAGE =
  'The agent stopped unexpectedly. Send a new message to try again.';

const FILE_MODIFYING_TOOLS = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

@Injectable()
export class AgentService implements IAgentService, OnModuleDestroy {
  private readonly logger = new Logger(AgentService.name);
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly currentMessageIds = new Map<string, string>();
  private readonly circuitBreakerTimers = new Map<string, NodeJS.Timeout>();
  private readonly currentBlockTypes = new Map<string, 'text' | 'tool_use'>();
  private readonly currentToolCallIds = new Map<string, string>();
  private readonly activeToolCalls = new Map<string, Map<string, ToolCallInfo>>();
  private readonly pendingClassifierPromises = new Map<string, Promise<unknown>[] >();

  constructor(
    @Inject(SANDBOX_SERVICE) private readonly sandboxService: ISandboxService,
    private readonly sessionEvents: SessionEventsService,
    private readonly prisma: PrismaService,
    private readonly classifier: ToolPillClassifierService,
    private readonly costTracking: CostTrackingService,
  ) {}

  async runTurn(params: AgentRunParams): Promise<void> {
    const { conversationId, sandboxId, message, userId } = params;

    if (this.activeRuns.has(conversationId)) {
      this.logger.warn(
        `Concurrent runTurn rejected for conversation ${conversationId} — a turn is already in flight`,
      );
      return;
    }

    const abortController = new AbortController();

    this.sessionEvents.emit(conversationId, {
      event: EventType.RUN_STARTED,
      data: { threadId: conversationId },
    });

    let accumulatedText = '';
    const segments: MessageSegment[] = [{ type: 'text', content: '' }];
    let lastCostData: {
      totalCostUsd: number;
      sessionId: string;
      numTurns: number;
      durationMs: number;
    } | null = null;

    const abortPromise = new Promise<never>((_, reject) => {
      abortController.signal.addEventListener(
        'abort',
        () => { reject(new Error('CIRCUIT_BREAKER_FIRED')); },
        { once: true },
      );
    });

    this.startCircuitBreakerTimer(conversationId);

    try {
      const agentQuery = query({
        prompt: message,
        options: {
          cwd: process.env.AGENT_WORKDIR ?? tmpdir(),
          abortController,
          env: {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
          },
          includePartialMessages: true,
        },
      });

      this.activeRuns.set(conversationId, {
        sandboxId,
        abortController,
        query: agentQuery,
        userId,
      });

      const iterator: AsyncIterator<SDKMessage> = agentQuery[Symbol.asyncIterator]();

      while (!abortController.signal.aborted) {
        let result: IteratorResult<SDKMessage>;
        try {
          result = await Promise.race([iterator.next(), abortPromise]);
        } catch (err) {
          if (abortController.signal.aborted) break;
          const pendingPromises = this.pendingClassifierPromises.get(conversationId) ?? [];
          if (pendingPromises.length > 0) {
            await Promise.allSettled(pendingPromises);
          }
          throw err;
        }
        if (result.done) break;
        this.resetCircuitBreakerTimer(conversationId);
        const textDelta = this.processSdkMessage(result.value, conversationId, userId, segments);
        accumulatedText += textDelta;
        if (textDelta) {
          const lastSeg = segments[segments.length - 1];
          if (lastSeg && lastSeg.type === 'text') {
            lastSeg.content += textDelta;
          } else {
            segments.push({ type: 'text', content: textDelta });
          }
        }

        if (result.value.type === 'result') {
          const resultMsg = result.value as {
            total_cost_usd: number;
            session_id: string;
            num_turns: number;
            duration_ms: number;
          };
          if (
            Number.isFinite(resultMsg.total_cost_usd) &&
            Number.isFinite(resultMsg.num_turns) &&
            Number.isFinite(resultMsg.duration_ms)
          ) {
            lastCostData = {
              totalCostUsd: resultMsg.total_cost_usd,
              sessionId: resultMsg.session_id,
              numTurns: resultMsg.num_turns,
              durationMs: resultMsg.duration_ms,
            };
          } else {
            this.logger.warn(
              `Non-finite cost data from SDK for conversation ${conversationId}: total_cost_usd=${resultMsg.total_cost_usd}, num_turns=${resultMsg.num_turns}, duration_ms=${resultMsg.duration_ms}`,
            );
          }
        }
      }

      this.clearCircuitBreakerTimer(conversationId);

      const pendingPromises = this.pendingClassifierPromises.get(conversationId) ?? [];
      if (pendingPromises.length > 0) {
        await Promise.allSettled(pendingPromises);
      }

      if (lastCostData) {
        try {
          await this.costTracking.recordCost({
            userId,
            conversationId,
            totalCostUsd: lastCostData.totalCostUsd,
            sessionId: lastCostData.sessionId,
            numTurns: lastCostData.numTurns,
            durationMs: lastCostData.durationMs,
          });
        } catch (err) {
          this.logger.error(
            `Failed to record cost for conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (!abortController.signal.aborted) {
        const hasToolCalls = segments.some((s) => s.type === 'tool_call');
        if (accumulatedText.length > 0 || hasToolCalls) {
          const cleanSegments = segments.filter(
            (s) => s.type !== 'text' || s.content.length > 0,
          );
          try {
            await this.prisma.turn.create({
              data: {
                conversationId,
                role: 'assistant',
                content: accumulatedText,
                segments: (cleanSegments.length > 0 ? cleanSegments : segments) as unknown as Prisma.InputJsonValue,
              },
              select: { id: true },
            });
            await this.prisma.conversation.update({
              where: { id: conversationId },
              data: { lastActiveAt: new Date() },
              select: { id: true },
            });
          } catch (err) {
            this.logger.error(
              `Failed to persist assistant turn for conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        this.sessionEvents.emit(conversationId, {
          event: EventType.RUN_FINISHED,
          data: {},
        });
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown agent error';
        this.logger.error(`Agent run failed for conversation ${conversationId}: ${errorMessage}`);
        this.sessionEvents.emit(conversationId, {
          event: EventType.RUN_ERROR,
          data: { message: errorMessage },
        });
      }
    } finally {
      this.clearCircuitBreakerTimer(conversationId);
      this.currentMessageIds.delete(conversationId);
      this.currentBlockTypes.delete(conversationId);
      this.currentToolCallIds.delete(conversationId);
      this.activeToolCalls.delete(conversationId);
      this.pendingClassifierPromises.delete(conversationId);
      this.activeRuns.delete(conversationId);
    }
  }

  async stop(conversationId: string): Promise<void> {
    const activeRun = this.activeRuns.get(conversationId);
    if (!activeRun) {
      return;
    }

    if (activeRun.abortController.signal.aborted) {
      this.activeRuns.delete(conversationId);
      this.currentMessageIds.delete(conversationId);
      this.currentBlockTypes.delete(conversationId);
      this.currentToolCallIds.delete(conversationId);
      this.activeToolCalls.delete(conversationId);
      this.pendingClassifierPromises.delete(conversationId);
      return;
    }

    this.clearCircuitBreakerTimer(conversationId);

    activeRun.abortController.abort();

    try {
      await activeRun.query.interrupt();
    } catch (err) {
      this.logger.warn(`Failed to interrupt agent query for conversation ${conversationId}: ${err}`);
    }

    const pendingPromises = this.pendingClassifierPromises.get(conversationId) ?? [];
    if (pendingPromises.length > 0) {
      await Promise.allSettled(pendingPromises);
    }

    this.sessionEvents.emit(conversationId, {
      event: EventType.RUN_FINISHED,
      data: {},
    });

    this.activeRuns.delete(conversationId);
    this.currentMessageIds.delete(conversationId);
    this.currentBlockTypes.delete(conversationId);
    this.currentToolCallIds.delete(conversationId);
    this.activeToolCalls.delete(conversationId);
    this.pendingClassifierPromises.delete(conversationId);
  }

  onModuleDestroy() {
    for (const [conversationId, activeRun] of this.activeRuns) {
      activeRun.abortController.abort();
      this.logger.log(`Aborted agent run for conversation ${conversationId} on module destroy`);
    }
    this.activeRuns.clear();
    this.currentMessageIds.clear();
    this.currentBlockTypes.clear();
    this.currentToolCallIds.clear();
    this.activeToolCalls.clear();
    this.pendingClassifierPromises.clear();
    for (const timer of this.circuitBreakerTimers.values()) {
      clearTimeout(timer);
    }
    this.circuitBreakerTimers.clear();
  }

  private startCircuitBreakerTimer(conversationId: string): void {
    this.clearCircuitBreakerTimer(conversationId);
    const timer = setTimeout(() => {
      this.handleCircuitBreaker(conversationId);
    }, CIRCUIT_BREAKER_TIMEOUT_MS);
    timer.unref?.();
    this.circuitBreakerTimers.set(conversationId, timer);
  }

  private resetCircuitBreakerTimer(conversationId: string): void {
    const existingTimer = this.circuitBreakerTimers.get(conversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      this.handleCircuitBreaker(conversationId);
    }, CIRCUIT_BREAKER_TIMEOUT_MS);
    timer.unref?.();
    this.circuitBreakerTimers.set(conversationId, timer);
  }

  private clearCircuitBreakerTimer(conversationId: string): void {
    const timer = this.circuitBreakerTimers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      this.circuitBreakerTimers.delete(conversationId);
    }
  }

  private handleCircuitBreaker(conversationId: string): void {
    const activeRun = this.activeRuns.get(conversationId);
    if (!activeRun) return;

    this.logger.warn(`Circuit breaker fired for conversation ${conversationId}`);

    const pendingPromises = this.pendingClassifierPromises.get(conversationId) ?? [];

    activeRun.abortController.abort();

    // Cancel the in-process agent run. interrupt() may reject asynchronously or
    // throw synchronously (e.g. if the SDK contract changes and interrupt is no
    // longer a function); log either without letting it block the RUN_ERROR emit
    // below. Kept synchronous at the call site so the RUN_ERROR emit still
    // happens within the same macrotask as the setTimeout callback.
    try {
      void activeRun.query.interrupt().catch((err) => {
        this.logger.warn(`Failed to interrupt agent query for conversation ${conversationId}: ${err}`);
      });
    } catch (err) {
      this.logger.warn(`Failed to interrupt agent query for conversation ${conversationId}: ${err}`);
    }

    const emitRunError = () => {
      this.sessionEvents.emit(conversationId, {
        event: EventType.RUN_ERROR,
        data: { message: CIRCUIT_BREAKER_MESSAGE },
      });
    };

    if (pendingPromises.length > 0) {
      void Promise.allSettled(pendingPromises).then(emitRunError);
    } else {
      emitRunError();
    }

    this.circuitBreakerTimers.delete(conversationId);
  }

  private processSdkMessage(sdkMessage: SDKMessage, conversationId: string, userId: string, segments: MessageSegment[]): string {
    if (sdkMessage.type === 'stream_event') {
      return this.processStreamEvent(sdkMessage.event, conversationId, segments);
    }
    if (sdkMessage.type === 'result') {
      return '';
    }
    if (sdkMessage.type === 'assistant') {
      return this.processAssistantMessage(sdkMessage, conversationId);
    }
    if (sdkMessage.type === 'user') {
      return this.processUserMessage(sdkMessage, conversationId, userId, segments);
    }
    return '';
  }

  private processStreamEvent(event: unknown, conversationId: string, segments: MessageSegment[]): string {
    const e = event as { type: string; [key: string]: unknown };
    if (e.type === 'content_block_start') {
      const contentBlock = e.content_block as { type: string; id?: string; name?: string; text?: string };
      if (contentBlock.type === 'text') {
        const messageId = contentBlock.id ?? `msg-${Date.now()}`;
        this.currentMessageIds.set(conversationId, messageId);
        this.currentBlockTypes.set(conversationId, 'text');
        this.sessionEvents.emit(conversationId, {
          event: EventType.TEXT_MESSAGE_START,
          data: { messageId, role: 'assistant' },
        });
      } else if (contentBlock.type === 'tool_use') {
        const toolCallId = contentBlock.id ?? `tool-${Date.now()}`;
        const toolCallName = contentBlock.name ?? 'unknown';
        this.currentBlockTypes.set(conversationId, 'tool_use');
        this.currentToolCallIds.set(conversationId, toolCallId);
        if (!this.activeToolCalls.has(conversationId)) {
          this.activeToolCalls.set(conversationId, new Map());
        }
        this.activeToolCalls.get(conversationId)!.set(toolCallId, {
          toolCallId,
          toolName: toolCallName,
          input: '',
        });
        const existingSeg = segments.find(
          (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
        );
        if (!existingSeg) {
          segments.push({
            type: 'tool_call',
            toolCall: { toolCallId, toolName: toolCallName, status: 'running', input: '', output: '' },
          });
        }
        this.sessionEvents.emit(conversationId, {
          event: EventType.TOOL_CALL_START,
          data: { toolCallId, toolCallName, parentMessageId: null },
        });
      }
    } else if (e.type === 'content_block_delta') {
      const delta = e.delta as { type: string; text?: string; partial_json?: string };
      if (delta.type === 'text_delta' && delta.text) {
        const messageId = this.currentMessageIds.get(conversationId) ?? `msg-${Date.now()}`;
        this.sessionEvents.emit(conversationId, {
          event: EventType.TEXT_MESSAGE_CONTENT,
          data: { messageId, delta: delta.text },
        });
        return delta.text;
      }
      if (delta.type === 'input_json_delta' && delta.partial_json) {
        const toolCallId = this.currentToolCallIds.get(conversationId);
        if (toolCallId) {
          const toolCalls = this.activeToolCalls.get(conversationId);
          const toolCallInfo = toolCalls?.get(toolCallId);
          if (toolCallInfo) {
            toolCallInfo.input += delta.partial_json;
          }
          const seg = segments.find(
            (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
          );
          if (seg && seg.type === 'tool_call') {
            seg.toolCall.input += delta.partial_json;
          }
          this.sessionEvents.emit(conversationId, {
            event: EventType.TOOL_CALL_ARGS,
            data: { toolCallId, delta: delta.partial_json },
          });
        }
      }
    } else if (e.type === 'content_block_stop') {
      const blockType = this.currentBlockTypes.get(conversationId);
      if (blockType === 'tool_use') {
        const toolCallId = this.currentToolCallIds.get(conversationId);
        if (toolCallId) {
          const seg = segments.find(
            (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
          );
          if (seg && seg.type === 'tool_call' && seg.toolCall.status !== 'error') {
            seg.toolCall.status = 'completed';
          }
          this.sessionEvents.emit(conversationId, {
            event: EventType.TOOL_CALL_END,
            data: { toolCallId },
          });
        }
        this.currentToolCallIds.delete(conversationId);
        this.currentBlockTypes.delete(conversationId);
      } else {
        const messageId = this.currentMessageIds.get(conversationId) ?? `msg-${Date.now()}`;
        this.sessionEvents.emit(conversationId, {
          event: EventType.TEXT_MESSAGE_END,
          data: { messageId },
        });
        this.currentMessageIds.delete(conversationId);
        this.currentBlockTypes.delete(conversationId);
      }
    }
    return '';
  }

  private processAssistantMessage(message: SDKMessage, conversationId: string): string {
    const msg = message as {
      type: string;
      message?: {
        content?: Array<{
          type: string;
          id?: string;
          name?: string;
          input?: unknown;
        }>;
      };
    };

    const content = msg.message?.content;
    if (!content || !Array.isArray(content)) {
      return '';
    }

    for (const block of content) {
      if (block.type === 'tool_use' && block.id) {
        if (!this.activeToolCalls.has(conversationId)) {
          this.activeToolCalls.set(conversationId, new Map());
        }
        if (!this.activeToolCalls.get(conversationId)!.has(block.id)) {
          this.activeToolCalls.get(conversationId)!.set(block.id, {
            toolCallId: block.id,
            toolName: block.name ?? 'unknown',
            input: typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? ''),
          });
        }
      }
    }

    return '';
  }

  private processUserMessage(message: SDKMessage, conversationId: string, userId: string, segments: MessageSegment[]): string {
    const msg = message as {
      type: string;
      message?: {
        content?: string | Array<{
          type: string;
          tool_use_id?: string;
          content?: unknown;
          is_error?: boolean;
        }>;
      };
    };

    const content = msg.message?.content;
    if (!content || typeof content === 'string' || !Array.isArray(content)) {
      return '';
    }

    for (const block of content) {
      if (block.type !== 'tool_result' || !block.tool_use_id) {
        continue;
      }
      const toolCallId = block.tool_use_id;
      const rawContent = block.content;
      const resultContent =
        typeof rawContent === 'string'
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((b: { text?: string }) => b.text ?? '').join('\n')
            : rawContent != null ? String(rawContent) : '';

      this.sessionEvents.emit(conversationId, {
        event: EventType.TOOL_CALL_RESULT,
        data: {
          messageId: toolCallId,
          toolCallId,
          content: resultContent,
          role: 'tool',
          isError: block.is_error === true,
        },
      });

      const resultSeg = segments.find(
        (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
      );
      if (resultSeg && resultSeg.type === 'tool_call') {
        resultSeg.toolCall.output = resultContent;
        if (block.is_error) {
          resultSeg.toolCall.status = 'error';
          resultSeg.toolCall.errorMessage = resultContent;
        }
      }

      const toolCalls = this.activeToolCalls.get(conversationId);
      const toolCallInfo = toolCalls?.get(toolCallId);
      if (!toolCallInfo) {
        continue;
      }

      const classifierPromise = this.classifier
        .classifyToolResult(
          toolCallId,
          toolCallInfo.toolName,
          toolCallInfo.input,
          resultContent,
          userId,
        )
        .then((result) => {
          if (!result) return;
          if (result.type === 'TOOL_CALL_PROMOTED') {
            const seg = segments.find(
              (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
            );
            if (seg && seg.type === 'tool_call') {
              seg.toolCall.semantic = {
                artifactType: result.artifactType,
                artifactTitle: result.artifactTitle,
                viewHref: result.viewHref,
              };
            }
          } else if (result.type === 'CREDENTIAL_FAILURE') {
            const seg = segments.find(
              (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
            );
            if (seg && seg.type === 'tool_call') {
              seg.toolCall.status = 'error';
              seg.toolCall.errorMessage = 'GitHub credentials have expired or been revoked.';
            }
          } else if (result.type === 'ACCESS_DENIED') {
            const seg = segments.find(
              (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
            );
            if (seg && seg.type === 'tool_call') {
              seg.toolCall.status = 'error';
              seg.toolCall.errorMessage = 'Access denied.';
              seg.toolCall.accessNotice = { code: result.code, retryAfter: result.retryAfter };
            }
          }
          this.sessionEvents.emit(conversationId, {
            event: result.type,
            data: result,
          });
        })
        .catch((err) => {
          this.logger.error(`Classifier failed for tool call ${toolCallId}: ${err}`);
        });

      if (!this.pendingClassifierPromises.has(conversationId)) {
        this.pendingClassifierPromises.set(conversationId, []);
      }
      this.pendingClassifierPromises.get(conversationId)!.push(classifierPromise);

      if (FILE_MODIFYING_TOOLS.has(toolCallInfo.toolName)) {
        const activeRun = this.activeRuns.get(conversationId);
        if (activeRun) {
          const workingTreePromise = this.sandboxService
            .getWorkingTreeStatus(activeRun.sandboxId)
            .then((status) => {
              if (status.dirty) {
                this.sessionEvents.emit(conversationId, {
                  event: 'WORKING_TREE_DIRTY',
                  data: { files: status.files },
                });
              } else {
                this.sessionEvents.emit(conversationId, {
                  event: 'WORKING_TREE_CLEAN',
                  data: {},
                });
              }
            })
            .catch((err) => {
              this.logger.warn(`Working tree check failed for conversation ${conversationId}: ${err}`);
            });
          const pending = this.pendingClassifierPromises.get(conversationId);
          if (pending) {
            pending.push(workingTreePromise);
          }
        }
      }
    }

    return '';
  }

  isIdle(conversationId: string): boolean {
    return !this.activeRuns.has(conversationId);
  }
}
