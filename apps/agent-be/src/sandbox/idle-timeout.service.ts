import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

export const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

@Injectable()
export class IdleTimeoutService implements OnModuleDestroy {
  private readonly logger = new Logger(IdleTimeoutService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly timeoutMs = DEFAULT_IDLE_TIMEOUT_MS;

  startTimer(
    conversationId: string,
    sandboxId: string,
    onTimeout: () => Promise<void>,
  ): void {
    this.clearTimer(conversationId);

    const timer = setTimeout(async () => {
      this.logger.log(`Idle timeout fired for conversation ${conversationId}`);
      this.timers.delete(conversationId);
      try {
        await onTimeout();
      } catch (err) {
        this.logger.error(`Idle timeout callback failed for conversation ${conversationId}: ${err}`);
      }
    }, this.timeoutMs);

    this.timers.set(conversationId, timer);
  }

  clearTimer(conversationId: string): void {
    const timer = this.timers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(conversationId);
    }
  }

  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  onModuleDestroy(): void {
    this.clearAll();
  }
}
