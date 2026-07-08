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

const REPO_SUBDIRECTORY = 'repo';

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
    const response = await sandbox.process.executeCommand(
      `git clone --depth=1 ${this.shellQuote(repoWithToken)} ${REPO_SUBDIRECTORY}`,
      undefined,
      undefined,
      30,
    );
    if (response.exitCode !== 0) {
      throw new Error(this.redactCredential(response.result, credential));
    }
  }

  async resume(sandboxId: string): Promise<SandboxInfo> {
    if (!this.daytona) {
      throw new Error('Daytona client is not configured');
    }
    const sandbox = await this.getSandbox(sandboxId);
    await this.daytona.start(sandbox);
    return {
      sandboxId: sandbox.id,
      conversationId: sandbox.labels?.conversationId || sandboxId,
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
    const nameResponse = await sandbox.process.executeCommand(
      `git config user.name ${this.shellQuote(config.name)}`,
      REPO_SUBDIRECTORY,
      undefined,
      10,
    );
    if (nameResponse.exitCode !== 0) {
      throw new Error(nameResponse.result);
    }
    const emailResponse = await sandbox.process.executeCommand(
      `git config user.email ${this.shellQuote(config.email)}`,
      REPO_SUBDIRECTORY,
      undefined,
      10,
    );
    if (emailResponse.exitCode !== 0) {
      throw new Error(emailResponse.result);
    }
  }

  async getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus> {
    const sandbox = await this.getSandbox(sandboxId);
    const response = await sandbox.process.executeCommand(
      'git status --porcelain -z',
      REPO_SUBDIRECTORY,
      undefined,
      10,
    );
    if (response.exitCode !== 0) {
      throw new Error(response.result);
    }
    const output = response.result;
    if (!output) {
      return { dirty: false, files: [] };
    }
    // NUL-separated entries. -z disables quoting and path-encoding, and splits
    // renames/copies into two fields: "R  old.ts\0new.ts\0". A trailing NUL
    // produces an empty entry that must be filtered out.
    const entries = output.split('\0').filter((entry) => entry.length > 0);
    const files: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      // XY status occupies the first two characters, then a space, then the path.
      const x = entry.charAt(0);
      if (x === 'R' || x === 'C') {
        // Rename/copy: the new path is the NEXT NUL-separated field.
        i++;
        const newPath = entries[i];
        if (newPath === undefined) {
          // Truncated output (e.g. timeout mid-stream with exitCode 0) — stop
          // processing; remaining entries are unreliable.
          this.logger.warn(
            'getWorkingTreeStatus: truncated porcelain output — rename entry missing new path',
          );
          break;
        }
        files.push(newPath);
      } else {
        // All other statuses: path is entry.slice(3) ("XY filename").
        const path = entry.slice(3);
        if (path) {
          files.push(path);
        }
      }
    }
    return { dirty: true, files };
  }

  async commit(sandboxId: string, message: string): Promise<void> {
    const sandbox = await this.getSandbox(sandboxId);
    const addResponse = await sandbox.process.executeCommand(
      'git add -A',
      REPO_SUBDIRECTORY,
      undefined,
      10,
    );
    if (addResponse.exitCode !== 0) {
      throw new Error(addResponse.result);
    }
    const response = await sandbox.process.executeCommand(
      `git commit -m ${this.shellQuote(message)}`,
      REPO_SUBDIRECTORY,
      undefined,
      10,
    );
    if (response.exitCode !== 0) {
      throw new Error(response.result);
    }
  }

  async listSkills(sandboxId: string): Promise<SkillInfo[]> {
    try {
      const sandbox = await this.getSandbox(sandboxId);
      const response = await sandbox.process.executeCommand(
        'ls -1 .claude/skills/',
        REPO_SUBDIRECTORY,
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

  /**
   * Strip the OAuth token from git command output before it reaches user-facing
   * error messages (SESSION_ERROR → FE). Modern git redacts userinfo in
   * `fatal: Authentication failed for '<url>'`, but response.result is opaque
   * combined output and the sandbox's git version is not controlled — defense
   * in depth against token leakage.
   */
  private redactCredential(text: string, credential: string): string {
    if (!credential) {
      return text;
    }
    return text.split(credential).join('[REDACTED]');
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
