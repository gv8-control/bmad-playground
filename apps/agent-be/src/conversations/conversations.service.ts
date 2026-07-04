import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { IdleTimeoutService } from '../sandbox/idle-timeout.service';
import { SessionEventsService } from '../streaming/session-events.service';
import { generateSemanticTitle } from './semantic-title';

type SandboxStatus = 'provisioning' | 'ready' | 'failed' | 'idle-timeout';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly sandboxStatuses = new Map<string, SandboxStatus>();
  private readonly sandboxIds = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SANDBOX_SERVICE) private readonly sandboxService: ISandboxService,
    private readonly credentialsService: CredentialsService,
    private readonly provisionQueue: ProvisionQueueService,
    private readonly idleTimeout: IdleTimeoutService,
    private readonly sessionEvents: SessionEventsService,
    @Inject(AGENT_SERVICE) private readonly agentService: IAgentService,
  ) {}

  async createConversation(userId: string): Promise<{ id: string }> {
    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
        title: null,
        lastActiveAt: new Date(),
      },
    });

    this.sandboxStatuses.set(conversation.id, 'provisioning');
    void this.provisionSandbox(conversation.id, userId).catch((err) => {
      this.logger.error(`provisionSandbox failed for conversation ${conversation.id}: ${err}`);
    });

    return { id: conversation.id };
  }

  async provisionSandbox(conversationId: string, userId: string): Promise<void> {
    let sandboxId: string | null = null;

    try {
      await this.provisionQueue.acquire(userId);

      const repoConnection = await this.prisma.repoConnection.findUnique({
        where: { userId },
      });
      if (!repoConnection) {
        throw new Error(`No RepoConnection found for user ${userId}`);
      }

      const credential = await this.credentialsService.resolveOAuthToken(userId);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, githubLogin: true },
      });
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      const gitConfig: GitUserConfig = {
        name:
          user.name && user.name.trim().length > 0
            ? user.name
            : user.githubLogin,
        email:
          user.email && user.email.trim().length > 0
            ? user.email
            : `${user.githubLogin}@users.noreply.github.com`,
      };

      const sandbox = await this.sandboxService.provision({
        conversationId,
        repoUrl: repoConnection.repoUrl,
        credential,
      });
      sandboxId = sandbox.sandboxId;
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

      this.idleTimeout.startTimer(conversationId, sandboxId, async () => {
        this.sessionEvents.emit(conversationId, {
          event: 'SESSION_TIMEOUT',
          data: {},
        });
        this.sandboxStatuses.set(conversationId, 'idle-timeout');
        this.sandboxIds.delete(conversationId);
        try {
          await this.sandboxService.destroy(sandboxId!);
        } catch (err) {
          this.logger.error(`Failed to destroy sandbox ${sandboxId} on idle timeout: ${err}`);
        } finally {
          this.sessionEvents.complete(conversationId);
        }
      });
    } catch (err) {
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
      this.sessionEvents.emit(conversationId, {
        event: 'SESSION_ERROR',
        data: { message: err instanceof Error ? err.message : 'Unknown error' },
      });
      this.sessionEvents.complete(conversationId);
    } finally {
      this.provisionQueue.release(userId);
    }
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
      select: { id: true },
    });

    if (!conversation) {
      return { conversationId, sandboxStatus: 'failed' };
    }

    const status = this.sandboxStatuses.get(conversationId) ?? 'provisioning';
    return { conversationId, sandboxStatus: status };
  }

  async listSkills(conversationId: string, userId: string): Promise<SkillInfo[]> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!conversation) {
      return [];
    }

    const sandboxId = this.sandboxIds.get(conversationId);
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

    await this.onFirstMessage(conversationId);

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

    void this.runAgentTurn(conversationId, userId, content).catch((err) => {
      this.logger.error(`runAgentTurn failed for conversation ${conversationId}: ${err}`);
    });

    return { conversationId, title };
  }

  private async runAgentTurn(conversationId: string, userId: string, message: string): Promise<void> {
    const sandboxId = this.sandboxIds.get(conversationId);
    if (!sandboxId) {
      this.sessionEvents.emit(conversationId, {
        event: 'RUN_ERROR',
        data: { message: 'Session is not ready' },
      });
      return;
    }

    await this.agentService.runTurn({ conversationId, sandboxId, message, userId });
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
}
