import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ISandboxService, IAgentService } from '@bmad-easy/shared-types';
import { SANDBOX_SERVICE, AGENT_SERVICE } from '@bmad-easy/shared-types';
import { SessionEventsService } from '../streaming/session-events.service';

const DRAIN_COMPLETION_TIMEOUT_MS = 5_000;

@Injectable()
export class ManualCommitService implements OnModuleDestroy {
  private readonly pendingCommits = new Set<string>();
  private readonly executingCommits = new Set<string>();
  private readonly pendingSandboxIds = new Map<string, string>();

  constructor(
    @Inject(SANDBOX_SERVICE) private readonly sandboxService: ISandboxService,
    @Inject(AGENT_SERVICE) private readonly agentService: IAgentService,
    private readonly sessionEvents: SessionEventsService,
  ) {}

  async requestCommit(
    conversationId: string,
    _userId: string,
    sandboxId: string,
  ): Promise<{ committed: boolean; clean: boolean; queued: boolean }> {
    if (this.pendingCommits.has(conversationId) || this.executingCommits.has(conversationId)) {
      return { committed: false, clean: false, queued: true };
    }

    if (!this.agentService.isIdle(conversationId)) {
      this.pendingCommits.add(conversationId);
      this.pendingSandboxIds.set(conversationId, sandboxId);
      return { committed: false, clean: false, queued: true };
    }

    return this.runCommit(conversationId, sandboxId);
  }

  async flushPendingCommit(
    conversationId: string,
    sandboxId: string,
  ): Promise<void> {
    if (!this.pendingCommits.has(conversationId) || this.executingCommits.has(conversationId)) {
      return;
    }
    this.pendingCommits.delete(conversationId);
    this.pendingSandboxIds.delete(conversationId);
    await this.runCommit(conversationId, sandboxId);
  }

  private async runCommit(
    conversationId: string,
    sandboxId: string,
  ): Promise<{ committed: boolean; clean: boolean; queued: boolean }> {
    this.executingCommits.add(conversationId);
    let result: { committed: boolean; clean: boolean; queued: boolean };
    try {
      result = await this.executeCommit(conversationId, sandboxId);
    } finally {
      this.executingCommits.delete(conversationId);
    }
    if (this.pendingCommits.has(conversationId)) {
      this.pendingCommits.delete(conversationId);
      this.pendingSandboxIds.delete(conversationId);
      void this.runCommit(conversationId, sandboxId).catch(() => undefined);
    }
    return result;
  }

  private async executeCommit(
    conversationId: string,
    sandboxId: string,
  ): Promise<{ committed: boolean; clean: boolean; queued: boolean }> {
    try {
      const workingTree = await this.sandboxService.getWorkingTreeStatus(sandboxId);

      if (!workingTree.dirty) {
        this.sessionEvents.emit(conversationId, {
          event: 'WORKING_TREE_CLEAN',
          data: {},
        });
        return { committed: false, clean: true, queued: false };
      }

      const timestamp = new Date().toISOString();
      const message = `chore(platform-save): checkpoint [${timestamp}]`;
      const toolCallId = `manual-save-${Date.now()}`;

      try {
        await this.sandboxService.commit(sandboxId, message);
        this.sessionEvents.emit(conversationId, {
          event: 'MANUAL_SAVE_SUCCEEDED',
          data: { toolCallId, timestamp },
        });
        this.sessionEvents.emit(conversationId, {
          event: 'WORKING_TREE_CLEAN',
          data: {},
        });
        return { committed: true, clean: false, queued: false };
      } catch (err) {
        this.sessionEvents.emit(conversationId, {
          event: 'MANUAL_SAVE_FAILED',
          data: { toolCallId, error: err instanceof Error ? err.message : 'Unknown error' },
        });
        return { committed: false, clean: false, queued: false };
      }
    } catch (err) {
      const toolCallId = `manual-save-${Date.now()}`;
      this.sessionEvents.emit(conversationId, {
        event: 'MANUAL_SAVE_FAILED',
        data: { toolCallId, error: err instanceof Error ? err.message : 'Unknown error' },
      });
      return { committed: false, clean: false, queued: false };
    }
  }

  async onModuleDestroy(): Promise<void> {
    const pendingEntries = [...this.pendingCommits].map((conversationId) => ({
      conversationId,
      sandboxId: this.pendingSandboxIds.get(conversationId),
    }));

    for (const conversationId of this.executingCommits) {
      this.emitDrainFailure(conversationId);
    }

    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    const drainDeadline = new Promise<'timeout'>((resolve) => {
      drainTimer = setTimeout(() => resolve('timeout'), DRAIN_COMPLETION_TIMEOUT_MS);
      drainTimer.unref?.();
    });

    await Promise.allSettled(
      pendingEntries.map(async ({ conversationId, sandboxId }) => {
        this.pendingCommits.delete(conversationId);
        this.pendingSandboxIds.delete(conversationId);

        if (
          !sandboxId ||
          !this.agentService.isIdle(conversationId) ||
          this.executingCommits.has(conversationId)
        ) {
          this.emitDrainFailure(conversationId);
          return;
        }

        const completionPromise = this.runCommit(conversationId, sandboxId)
          .then(() => 'ok' as const)
          .catch(() => 'error' as const);

        const outcome = await Promise.race([completionPromise, drainDeadline]);
        if (outcome === 'timeout' || outcome === 'error') {
          this.emitDrainFailure(conversationId);
        }
      }),
    );

    if (drainTimer) clearTimeout(drainTimer);

    this.pendingCommits.clear();
    this.executingCommits.clear();
    this.pendingSandboxIds.clear();
  }

  private emitDrainFailure(conversationId: string): void {
    this.sessionEvents.emit(conversationId, {
      event: 'MANUAL_SAVE_FAILED',
      data: { toolCallId: 'manual-save-drain', error: 'Server shutting down' },
    });
  }
}
