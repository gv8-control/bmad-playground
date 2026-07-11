import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

export const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
export const DEFAULT_MID_SESSION_IDLE_TIMEOUT_MS = 900_000;

const MAX_MID_SESSION_IDLE_TIMEOUT_MS = 86_400_000;

export const MID_SESSION_IDLE_TIMEOUT_MS = (() => {
  const parsed = parseInt(process.env.MID_SESSION_IDLE_TIMEOUT_MS ?? '900000', 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_MID_SESSION_IDLE_TIMEOUT_MS
    ? parsed
    : DEFAULT_MID_SESSION_IDLE_TIMEOUT_MS;
})();

@Injectable()
export class IdleTimeoutService implements OnModuleDestroy {
  private readonly logger = new Logger(IdleTimeoutService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly timeoutMs = DEFAULT_IDLE_TIMEOUT_MS;

  startTimer(
    conversationId: string,
    sandboxId: string,
    onTimeout: () => Promise<void>,
    timeoutMs?: number,
  ): void {
    this.clearTimer(conversationId);

    const delay = timeoutMs ?? this.timeoutMs;
    const timer = setTimeout(async () => {
      this.logger.log(`Idle timeout fired for conversation ${conversationId}`);
      this.timers.delete(conversationId);
      try {
        await onTimeout();
      } catch (err) {
        this.logger.error(`Idle timeout callback failed for conversation ${conversationId}: ${err}`);
      }
    }, delay);

    this.timers.set(conversationId, timer);
    timer.unref?.();
  }

  clearTimer(conversationId: string): void {
    const timer = this.timers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(conversationId);
    }
  }

  hasTimer(conversationId: string): boolean {
    return this.timers.has(conversationId);
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
