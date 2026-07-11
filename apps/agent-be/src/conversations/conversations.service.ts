import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  ISandboxService,
  GitUserConfig,
  SkillInfo,
  IAgentService,
} from '@bmad-easy/shared-types';
import { SANDBOX_SERVICE, AGENT_SERVICE } from '@bmad-easy/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ProvisionQueueService } from '../sandbox/provision-queue.service';
import { IdleTimeoutService, MID_SESSION_IDLE_TIMEOUT_MS } from '../sandbox/idle-timeout.service';
import { SessionEventsService } from '../streaming/session-events.service';
import { EventType } from '@ag-ui/core';
import { ManualCommitService } from './manual-commit.service';
import { generateSemanticTitle } from './semantic-title';
import { isCredentialFailureError, sanitizeProvisioningErrorMessage } from './provisioning-error.util';

type SandboxStatus = 'provisioning' | 'ready' | 'failed' | 'idle-timeout';

const MAX_CONCURRENT_CONVERSATIONS = (() => {
  const parsed = parseInt(process.env.MAX_CONCURRENT_CONVERSATIONS ?? '10', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
})();

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly sandboxStatuses = new Map<string, SandboxStatus>();
  private readonly sandboxIds = new Map<string, string>();
  private readonly cancelledConversations = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SANDBOX_SERVICE) private readonly sandboxService: ISandboxService,
    private readonly credentialsService: CredentialsService,
    private readonly provisionQueue: ProvisionQueueService,
    private readonly idleTimeout: IdleTimeoutService,
    private readonly sessionEvents: SessionEventsService,
    @Inject(AGENT_SERVICE) private readonly agentService: IAgentService,
    private readonly manualCommitService: ManualCommitService,
  ) {}

  async createConversation(userId: string): Promise<{ id: string }> {
    const activeCount = await this.countActiveConversations(userId);
    if (activeCount >= MAX_CONCURRENT_CONVERSATIONS) {
      throw new ConflictException({
        code: 'CONVERSATION_LIMIT_REACHED',
        message: `You've reached the limit of ${MAX_CONCURRENT_CONVERSATIONS} active conversations. Return to one of your existing conversations, or try again later.`,
        meta: { limit: MAX_CONCURRENT_CONVERSATIONS },
      });
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
        title: null,
        lastActiveAt: new Date(),
        sandboxStatus: 'provisioning',
      },
    });

    this.sandboxStatuses.set(conversation.id, 'provisioning');
    void this.provisionSandbox(conversation.id, userId).catch((err) => {
      this.logger.error(`provisionSandbox failed for conversation ${conversation.id}: ${err}`);
    });

    return { id: conversation.id };
  }

  private async countActiveConversations(userId: string): Promise<number> {
    return this.prisma.conversation.count({
      where: {
        userId,
        sandboxStatus: { in: ['provisioning', 'ready'] },
      },
    });
  }

  async provisionSandbox(conversationId: string, userId: string): Promise<void> {
    let sandboxId: string | null = null;

    try {
      await this.provisionQueue.acquire(userId);

      if (this.cancelledConversations.has(conversationId)) {
        this.logger.log(`Provisioning cancelled for conversation ${conversationId} after queue acquire`);
        return;
      }

      const repoConnection = await this.prisma.repoConnection.findUnique({
        where: { userId },
        select: { id: true, repoUrl: true },
      });
      if (!repoConnection) {
        throw new Error(`No RepoConnection found for user ${userId}`);
      }

      const credential = await this.credentialsService.resolveOAuthToken(userId);

      const credentialFailed = await this.credentialsService.isCredentialHealthFailed(userId);
      if (credentialFailed) {
        throw new Error('GitHub credential is marked as failed. Please reconnect your GitHub account.');
      }

      const gitConfig = await this.resolveGitIdentity(userId);

      const sandbox = await this.sandboxService.provision({
        conversationId,
        repoUrl: repoConnection.repoUrl,
        credential,
      });
      sandboxId = sandbox.sandboxId;

      if (this.cancelledConversations.has(conversationId)) {
        this.logger.log(`Provisioning cancelled for conversation ${conversationId} after sandbox provision`);
        await this.sandboxService.destroy(sandboxId);
        return;
      }

      this.sandboxIds.set(conversationId, sandboxId);

      await this.sandboxService.clone(sandboxId, repoConnection.repoUrl, credential);
      await this.sandboxService.injectGitConfig(sandboxId, gitConfig);
      const workingTree = await this.sandboxService.getWorkingTreeStatus(sandboxId);

      if (workingTree.dirty) {
        this.sessionEvents.emit(conversationId, {
          event: 'WORKING_TREE_DIRTY',
          data: { files: workingTree.files },
        });
      } else {
        this.sessionEvents.emit(conversationId, {
          event: 'WORKING_TREE_CLEAN',
          data: {},
        });
      }

      this.sessionEvents.emit(conversationId, {
        event: 'SESSION_READY',
        data: { sandboxId },
      });
      this.sandboxStatuses.set(conversationId, 'ready');
      await this.persistSandboxState(conversationId, sandboxId, 'ready');

      this.idleTimeout.startTimer(conversationId, sandboxId, async () => {
        this.sessionEvents.emit(conversationId, {
          event: 'SESSION_TIMEOUT',
          data: {},
        });
        this.sandboxStatuses.set(conversationId, 'idle-timeout');
        this.sandboxIds.delete(conversationId);
        await this.persistSandboxState(conversationId, null, 'idle-timeout');
        try {
          await this.sandboxService.destroy(sandboxId!);
        } catch (err) {
          this.logger.error(`Failed to destroy sandbox ${sandboxId} on idle timeout: ${err}`);
        } finally {
          this.sessionEvents.complete(conversationId);
        }
      });
    } catch (err) {
      if (this.cancelledConversations.has(conversationId)) {
        this.logger.log(`Provisioning cancelled for conversation ${conversationId} during pipeline`);
        return;
      }
      if (isCredentialFailureError(err)) {
        await this.credentialsService.markCredentialFailed(userId, new Date()).catch((markErr) => {
          this.logger.error(`Failed to mark credential as failed for user ${userId}: ${markErr}`);
        });
      }
      this.logger.error(`provisionSandbox pipeline failed for conversation ${conversationId}: ${err}`);
      if (sandboxId) {
        try {
          await this.sandboxService.destroy(sandboxId);
        } catch (destroyErr) {
          this.logger.error(`Failed to destroy sandbox ${sandboxId} after provision failure: ${destroyErr}`);
        }
      }
      this.sandboxStatuses.set(conversationId, 'failed');
      this.sandboxIds.delete(conversationId);
      await this.persistSandboxState(conversationId, null, 'failed');
      const rawMessage = err instanceof Error ? err.message : 'Unknown error';
      const sanitizedMessage = sanitizeProvisioningErrorMessage(rawMessage);

      this.sessionEvents.emit(conversationId, {
        event: 'SESSION_ERROR',
        data: { message: sanitizedMessage },
      });
      this.sessionEvents.complete(conversationId);
    } finally {
      this.provisionQueue.release(userId);
      this.cancelledConversations.delete(conversationId);
    }
  }

  async abandonConversation(
    conversationId: string,
    userId: string,
  ): Promise<{ conversationId: string; abandoned: boolean }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conversation) {
      return { conversationId, abandoned: false };
    }

    this.cancelledConversations.add(conversationId);

    const sandboxId = this.sandboxIds.get(conversationId);
    if (sandboxId) {
      try {
        await this.sandboxService.destroy(sandboxId);
      } catch (err) {
        this.logger.error(`Failed to destroy sandbox ${sandboxId} on abandon: ${err}`);
      }
    }

    this.idleTimeout.clearTimer(conversationId);
    this.sandboxStatuses.delete(conversationId);
    this.sandboxIds.delete(conversationId);

    try {
      await this.prisma.conversation.delete({ where: { id: conversationId } });
    } catch (err) {
      this.logger.error(`Failed to delete conversation ${conversationId} on abandon: ${err}`);
    }

    this.sessionEvents.complete(conversationId);

    return { conversationId, abandoned: true };
  }

  async onFirstMessage(conversationId: string): Promise<void> {
    this.idleTimeout.clearTimer(conversationId);
  }

  async getStatus(conversationId: string, userId: string): Promise<{
    conversationId: string;
    sandboxStatus: 'provisioning' | 'ready' | 'failed' | 'idle-timeout';
  }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, sandboxStatus: true },
    });

    if (!conversation) {
      return { conversationId, sandboxStatus: 'failed' };
    }

    const status =
      (conversation.sandboxStatus as SandboxStatus | null) ??
      this.sandboxStatuses.get(conversationId) ??
      'provisioning';
    return { conversationId, sandboxStatus: status };
  }

  async listSkills(conversationId: string, userId: string): Promise<SkillInfo[]> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, sandboxId: true },
    });

    if (!conversation) {
      return [];
    }

    const sandboxId = conversation.sandboxId;
    if (!sandboxId) {
      return [];
    }

    return this.sandboxService.listSkills(sandboxId);
  }

  async sendTurn(
    conversationId: string,
    userId: string,
    content: string,
  ): Promise<{ conversationId: string; title: string | null }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, title: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const sandboxId = this.sandboxIds.get(conversationId);
    if (!sandboxId) {
      throw new ConflictException({
        code: 'SESSION_NOT_READY',
        message: 'Session is not ready yet. Please wait a moment and try again.',
      });
    }

    await this.prisma.turn.create({
      data: { conversationId, role: 'user', content },
    });

    let title = conversation.title;
    if (conversation.title === null) {
      title = generateSemanticTitle(content);
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title, lastActiveAt: new Date() },
      });
    } else {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastActiveAt: new Date() },
      });
    }

    await this.onFirstMessage(conversationId);

    void this.runAgentTurn(conversationId, userId, content).catch((err) => {
      this.logger.error(`runAgentTurn failed for conversation ${conversationId}: ${err}`);
    });

    return { conversationId, title };
  }

  private async runAgentTurn(conversationId: string, userId: string, message: string): Promise<void> {
    const sandboxId = this.sandboxIds.get(conversationId);
    if (!sandboxId) {
      this.sessionEvents.emit(conversationId, {
        event: EventType.RUN_ERROR,
        data: { message: 'Session is not ready' },
      });
      return;
    }

    await this.agentService.runTurn({ conversationId, sandboxId, message, userId });
    await this.manualCommitService.flushPendingCommit(conversationId, sandboxId).catch((err) => {
      this.logger.error(`flushPendingCommit failed for conversation ${conversationId}: ${err}`);
    });

    this.idleTimeout.startTimer(
      conversationId,
      sandboxId,
      () => this.handleMidSessionIdleTimeout(conversationId, sandboxId, userId),
      MID_SESSION_IDLE_TIMEOUT_MS,
    );
  }

  private async handleMidSessionIdleTimeout(
    conversationId: string,
    sandboxId: string,
    userId: string,
  ): Promise<void> {
    try {
      const workingTree = await this.sandboxService.getWorkingTreeStatus(sandboxId);
      if (workingTree.dirty) {
        await this.manualCommitService.requestCommit(conversationId, userId, sandboxId);
      }
    } catch (err) {
      this.logger.error(
        `Pre-teardown save failed for conversation ${conversationId}: ${err}`,
      );
    }

    this.sessionEvents.emit(conversationId, {
      event: 'SESSION_TIMEOUT',
      data: { reason: 'mid-session' },
    });
    this.sandboxStatuses.set(conversationId, 'idle-timeout');
    this.sandboxIds.delete(conversationId);
    await this.persistSandboxState(conversationId, null, 'idle-timeout');
    try {
      await this.sandboxService.destroy(sandboxId);
    } catch (err) {
      this.logger.error(
        `Failed to destroy sandbox ${sandboxId} on mid-session idle timeout: ${err}`,
      );
    } finally {
      this.sessionEvents.complete(conversationId);
    }
  }

  async stopAgent(conversationId: string, userId: string): Promise<{ conversationId: string; stopped: boolean }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    await this.agentService.stop(conversationId);

    return { conversationId, stopped: true };
  }

  async manualCommit(
    conversationId: string,
    userId: string,
  ): Promise<{ committed: boolean; clean: boolean; queued: boolean }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const sandboxId = this.sandboxIds.get(conversationId);
    if (!sandboxId) {
      throw new NotFoundException('Session is not ready');
    }

    return this.manualCommitService.requestCommit(conversationId, userId, sandboxId);
  }

  async resumeConversation(
    conversationId: string,
    userId: string,
  ): Promise<{ conversationId: string; sandboxStatus: SandboxStatus }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, sandboxId: true, sandboxStatus: true },
    });

    if (!conversation) {
      return { conversationId, sandboxStatus: 'failed' };
    }

    const currentStatus = conversation.sandboxStatus as SandboxStatus | null;
    const sandboxId = conversation.sandboxId;

    if (currentStatus === 'ready' && sandboxId) {
      try {
        const gitConfig = await this.resolveGitIdentity(userId);
        await this.sandboxService.injectGitConfig(sandboxId, gitConfig);
        const workingTree = await this.sandboxService.getWorkingTreeStatus(sandboxId);

        if (workingTree.dirty) {
          this.sessionEvents.emit(conversationId, {
            event: 'WORKING_TREE_DIRTY',
            data: { files: workingTree.files },
          });
        } else {
          this.sessionEvents.emit(conversationId, {
            event: 'WORKING_TREE_CLEAN',
            data: {},
          });
        }

        this.sessionEvents.emit(conversationId, {
          event: 'SESSION_READY',
          data: { sandboxId },
        });

        this.sandboxStatuses.set(conversationId, 'ready');
        this.sandboxIds.set(conversationId, sandboxId);

        if (!this.idleTimeout.hasTimer(conversationId)) {
          this.idleTimeout.startTimer(
            conversationId,
            sandboxId,
            () => this.handleMidSessionIdleTimeout(conversationId, sandboxId, userId),
            MID_SESSION_IDLE_TIMEOUT_MS,
          );
        }

        return { conversationId, sandboxStatus: 'ready' };
      } catch (err) {
        this.logger.error(`Fast-path resume failed for conversation ${conversationId}: ${err}`);
        this.sandboxStatuses.set(conversationId, 'failed');
        await this.persistSandboxState(conversationId, null, 'failed');
        const rawMessage = err instanceof Error ? err.message : 'Unknown error';
        const sanitizedMessage = sanitizeProvisioningErrorMessage(rawMessage);

        this.sessionEvents.emit(conversationId, {
          event: 'SESSION_ERROR',
          data: { message: sanitizedMessage },
        });
        return { conversationId, sandboxStatus: 'failed' };
      }
    }

    if (currentStatus === 'provisioning') {
      return { conversationId, sandboxStatus: 'provisioning' };
    }

    this.sandboxStatuses.set(conversationId, 'provisioning');
    await this.persistSandboxState(conversationId, null, 'provisioning');
    void this.provisionSandbox(conversationId, userId).catch((err) => {
      this.logger.error(`provisionSandbox failed during resume for conversation ${conversationId}: ${err}`);
    });

    return { conversationId, sandboxStatus: 'provisioning' };
  }

  private async resolveGitIdentity(userId: string): Promise<GitUserConfig> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, githubLogin: true },
    });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    return {
      name:
        user.name && user.name.trim().length > 0
          ? user.name
          : user.githubLogin,
      email:
        user.email && user.email.trim().length > 0
          ? user.email
          : `${user.githubLogin}@users.noreply.github.com`,
    };
  }

  private async persistSandboxState(
    conversationId: string,
    sandboxId: string | null,
    sandboxStatus: SandboxStatus,
  ): Promise<void> {
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { sandboxId, sandboxStatus },
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist sandbox state for conversation ${conversationId}: ${err}`,
      );
    }
  }
}
