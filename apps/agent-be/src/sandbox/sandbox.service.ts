import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type {
  ISandboxService,
  ProvisionParams,
  SandboxInfo,
  GitUserConfig,
  WorkingTreeStatus,
  SkillInfo,
} from '@bmad-easy/shared-types';
import type { Daytona, Sandbox } from '@daytonaio/sdk';
import { DAYTONA_CLIENT } from './daytona-client.provider';

@Injectable()
export class SandboxService implements ISandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(@Inject(DAYTONA_CLIENT) private readonly daytona: Daytona | null) {}

  async provision(params: ProvisionParams): Promise<SandboxInfo> {
    if (!this.daytona) {
      throw new Error('Daytona client is not configured');
    }

    let sandbox: Sandbox | null = null;
    try {
      sandbox = await this.daytona.create({
        labels: { conversationId: params.conversationId },
      });
      return {
        sandboxId: sandbox.id,
        conversationId: params.conversationId,
        status: 'ready',
        provisionedAt: new Date(),
      };
    } catch (err) {
      if (sandbox) {
        try {
          await this.daytona.delete(sandbox);
        } catch (cleanupErr) {
          this.logger.error(`Failed to clean up partial sandbox allocation: ${cleanupErr}`);
        }
      }
      throw err;
    }
  }

  async clone(sandboxId: string, repoUrl: string, credential: string): Promise<void> {
    const sandbox = await this.getSandbox(sandboxId);
    const repoWithToken = this.injectCredentialIntoUrl(repoUrl, credential);
    await sandbox.process.executeCommand(
      `git clone --depth=1 ${this.shellQuote(repoWithToken)} .`,
      undefined,
      undefined,
      30,
    );
  }

  async resume(sandboxId: string): Promise<SandboxInfo> {
    if (!this.daytona) {
      throw new Error('Daytona client is not configured');
    }
    const sandbox = await this.getSandbox(sandboxId);
    await this.daytona.start(sandbox);
    return {
      sandboxId: sandbox.id,
      conversationId: sandboxId,
      status: 'ready',
      provisionedAt: new Date(),
    };
  }

  async destroy(sandboxId: string): Promise<void> {
    if (!this.daytona) {
      return;
    }
    try {
      const sandbox = await this.daytona.get(sandboxId);
      await this.daytona.delete(sandbox);
    } catch (err) {
      if (this.isNotFoundError(err)) {
        return;
      }
      throw err;
    }
  }

  async injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void> {
    const sandbox = await this.getSandbox(sandboxId);
    await sandbox.process.executeCommand(
      `git config user.name ${this.shellQuote(config.name)}`,
      undefined,
      undefined,
      10,
    );
    await sandbox.process.executeCommand(
      `git config user.email ${this.shellQuote(config.email)}`,
      undefined,
      undefined,
      10,
    );
  }

  async getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus> {
    const sandbox = await this.getSandbox(sandboxId);
    const response = await sandbox.process.executeCommand(
      'git status --porcelain',
      undefined,
      undefined,
      10,
    );
    const output = response.result.trim();
    if (!output) {
      return { dirty: false, files: [] };
    }
    const files = output.split('\n').map((line) => line.slice(3));
    return { dirty: true, files };
  }

  async commit(sandboxId: string, message: string): Promise<void> {
    const sandbox = await this.getSandbox(sandboxId);
    const addResponse = await sandbox.process.executeCommand(
      'git add -A',
      undefined,
      undefined,
      10,
    );
    if (addResponse.exitCode !== 0) {
      throw new Error(addResponse.result);
    }
    const response = await sandbox.process.executeCommand(
      `git commit -m ${this.shellQuote(message)}`,
      undefined,
      undefined,
      10,
    );
    if (response.exitCode !== 0) {
      throw new Error(response.result);
    }
  }

  async terminateProcess(sandboxId: string, processId: string): Promise<void> {
    const sandbox = await this.getSandbox(sandboxId);
    try {
      await sandbox.process.killPtySession(processId);
    } catch (err) {
      this.logger.warn(`Failed to terminate process ${processId} in sandbox ${sandboxId}: ${err}`);
    }
  }

  async listSkills(sandboxId: string): Promise<SkillInfo[]> {
    try {
      const sandbox = await this.getSandbox(sandboxId);
      const response = await sandbox.process.executeCommand(
        'ls -1 .claude/skills/',
        undefined,
        undefined,
        10,
      );
      const output = response.result.trim();
      if (!output) {
        return [];
      }
      return output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((name) => ({ name }));
    } catch (err) {
      this.logger.warn(`listSkills failed for sandbox ${sandboxId}: ${err}`);
      return [];
    }
  }

  private async getSandbox(sandboxId: string): Promise<Sandbox> {
    if (!this.daytona) {
      throw new Error('Daytona client is not configured');
    }
    return this.daytona.get(sandboxId);
  }

  private injectCredentialIntoUrl(repoUrl: string, credential: string): string {
    const url = new URL(repoUrl);
    url.username = 'x-access-token';
    url.password = credential;
    return url.toString();
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  private isNotFoundError(err: unknown): boolean {
    if (err instanceof Error) {
      const message = err.message.toLowerCase();
      return message.includes('not found') || message.includes('404');
    }
    return false;
  }
}
