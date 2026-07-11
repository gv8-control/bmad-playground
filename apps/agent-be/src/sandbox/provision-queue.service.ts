import { Injectable } from '@nestjs/common';

export const MAX_CONCURRENT_PROVISIONS = 2;

interface QueueEntry {
  active: number;
  queue: Array<() => void>;
}

@Injectable()
export class ProvisionQueueService {
  private readonly entries = new Map<string, QueueEntry>();

  async acquire(userId: string): Promise<void> {
    let entry = this.entries.get(userId);
    if (!entry) {
      entry = { active: 0, queue: [] };
      this.entries.set(userId, entry);
    }

    if (entry.active < MAX_CONCURRENT_PROVISIONS) {
      entry.active++;
      return;
    }

    return new Promise<void>((resolve) => {
      entry!.queue.push(resolve);
    });
  }

  release(userId: string): void {
    const entry = this.entries.get(userId);
    if (!entry) {
      return;
    }

    const next = entry.queue.shift();
    if (next) {
      next();
    } else {
      entry.active--;
      if (entry.active === 0) {
        this.entries.delete(userId);
      }
    }
  }
}
