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
import { DaytonaError, DaytonaNotFoundError, type Daytona, type Sandbox } from '@daytonaio/sdk';
import { DAYTONA_CLIENT } from './daytona-client.provider';

const REPO_SUBDIRECTORY = 'repo';

/**
 * Comma-separated CIDR allow-list passed to daytona.create() to activate
 * egress restriction. Daytona pre-whitelists package registries, GitHub/GitLab,
 * container registries, and AI/ML APIs (Anthropic, OpenAI) on all tiers
 * regardless of the custom allow-list. Setting networkAllowList activates the
 * restriction (only pre-whitelisted + allow-listed hosts are reachable),
 * closing the credential exfiltration path for sandbox-resident credentials
 * (GITHUB_TOKEN, ANTHROPIC_API_KEY). The dummy CIDR forces activation while
 * relying on the pre-whitelisted hosts for legitimate egress.
 */
const SANDBOX_NETWORK_ALLOW_LIST = '0.0.0.0/32';

/**
 * Path to the sandbox-agent binary baked into the agent-be Docker image
 * (downloaded + checksum-verified at Docker build time — see Dockerfile).
 * Uploaded to the sandbox during provision.
 */
const SANDBOX_AGENT_LOCAL_PATH = '/opt/sandbox-agent';

/**
 * Remote path inside the sandbox where the sandbox-agent binary is placed
 * and made executable.
 */
const SANDBOX_AGENT_REMOTE_PATH = '/usr/local/bin/sandbox-agent';

/**
 * Pinned exact version of the Claude Code CLI installed inside the sandbox
 * via `npm install -g`. No floating tags — pre-1.0/exact-version discipline.
 * The architecture's Dockerfile-pinning requirement (line 76/673) is scoped to
 * sandbox-agent specifically; Claude Code is distributed as an npm package,
 * so a module-level constant is the simplest reversible option (DP-3).
 */
const CLAUDE_CODE_VERSION = '2.1.210';

/**
 * Timeout (seconds) for short binary-install commands (chmod, --version
 * verifications). Matches the stall-detection discipline applied to other
 * sandbox executeCommand calls (injectGitConfig/commit use 10s; these run
 * during cold-start provision so a slightly larger budget is reasonable).
 */
const SANDBOX_AGENT_CMD_TIMEOUT_S = 30;

/**
 * Timeout (seconds) for `npm install -g` of the Claude Code CLI. A global
 * install of a CLI package can take 30-60s under normal conditions; 120s is
 * an upper bound that prevents a stalled install from blocking provision
 * (and the per-user provisionQueue lock) indefinitely.
 */
const SANDBOX_NPM_INSTALL_TIMEOUT_S = 120;

/**
 * Timeout (seconds) for uploading the sandbox-agent binary from the agent-be
 * image to the sandbox via `sandbox.fs.uploadFile`. The binary is a single
 * musl executable (tens of MB); 120s is a generous upper bound that prevents
 * a stalled upload (network issue between agent-be and Daytona) from blocking
 * `provision()` — and the per-user `provisionQueue` lock — indefinitely.
 * The SDK default is 30 minutes, which is far too long for a cold-start path.
 */
const SANDBOX_UPLOAD_TIMEOUT_S = 120;

@Injectable()
export class SandboxService implements ISandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(@Inject(DAYTONA_CLIENT) private readonly daytona: Daytona | null) {}

  async provision(params: ProvisionParams): Promise<SandboxInfo> {
    if (!this.daytona) {
      throw new Error('Daytona client is not configured');
    }

    // Fail fast before allocating any Daytona resource — env validation guards
    // this at boot, but an explicit guard here prevents a silent empty-key
    // injection if the var is unset at provision time (AC-5 loud-failure intent).
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured — cannot provision sandbox');
    }

    const sandbox = await this.daytona.create({
      labels: { conversationId: params.conversationId },
      envVars: {
        ANTHROPIC_API_KEY: anthropicApiKey,
        GITHUB_TOKEN: params.credential,
      },
      networkAllowList: SANDBOX_NETWORK_ALLOW_LIST,
    });

    // installBinaries runs AFTER create() succeeds — if it throws, the sandbox
    // is already allocated in Daytona. Clean it up before re-throwing so the
    // failure does not leak a zombie sandbox (the caller's catch cannot clean
    // up because provision() rejects before returning the sandbox id).
    try {
      await this.installBinaries(sandbox);
    } catch (err) {
      await this.daytona.delete(sandbox).catch((deleteErr) => {
        this.logger.error(
          `Failed to clean up sandbox ${sandbox.id} after installBinaries failure: ${deleteErr}`,
        );
      });
      throw err;
    }

    return {
      sandboxId: sandbox.id,
      conversationId: params.conversationId,
      status: 'ready',
      provisionedAt: new Date(),
    };
  }

  async clone(sandboxId: string, repoUrl: string, credential: string): Promise<void> {
    const sandbox = await this.getSandbox(sandboxId);
    await sandbox.git.clone(
      repoUrl,
      REPO_SUBDIRECTORY,
      undefined,
      undefined,
      'x-access-token',
      credential,
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
      if (
        err instanceof DaytonaNotFoundError ||
        (err instanceof DaytonaError && err.statusCode === 404)
      ) {
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
    const status = await sandbox.git.status(REPO_SUBDIRECTORY);
    const files = status.fileStatus
      .filter((f) => f.staging !== 'Unmodified' || f.worktree !== 'Unmodified')
      .map((f) => f.name);
    return { dirty: files.length > 0, files };
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

  /**
   * Installs the sandbox-agent binary (uploaded from the agent-be image) and
   * the Claude Code CLI (npm global install) inside the sandbox, then verifies
   * both are executable. Throws on any failure — a sandbox without the binaries
   * cannot run the agent. All paths and versions are constants (no user input).
   */
  private async installBinaries(sandbox: Sandbox): Promise<void> {
    await sandbox.fs.uploadFile(
      SANDBOX_AGENT_LOCAL_PATH,
      SANDBOX_AGENT_REMOTE_PATH,
      SANDBOX_UPLOAD_TIMEOUT_S,
    );

    const chmodResponse = await sandbox.process.executeCommand(
      `chmod +x ${SANDBOX_AGENT_REMOTE_PATH}`,
      undefined,
      undefined,
      SANDBOX_AGENT_CMD_TIMEOUT_S,
    );
    if (chmodResponse.exitCode !== 0) {
      throw new Error(`Failed to make sandbox-agent executable: ${chmodResponse.result}`);
    }

    const npmInstallResponse = await sandbox.process.executeCommand(
      `npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`,
      undefined,
      undefined,
      SANDBOX_NPM_INSTALL_TIMEOUT_S,
    );
    if (npmInstallResponse.exitCode !== 0) {
      throw new Error(`Failed to install Claude Code CLI: ${npmInstallResponse.result}`);
    }

    const agentVerifyResponse = await sandbox.process.executeCommand(
      `${SANDBOX_AGENT_REMOTE_PATH} --version`,
      undefined,
      undefined,
      SANDBOX_AGENT_CMD_TIMEOUT_S,
    );
    if (agentVerifyResponse.exitCode !== 0) {
      throw new Error(`sandbox-agent binary verification failed: ${agentVerifyResponse.result}`);
    }

    const claudeVerifyResponse = await sandbox.process.executeCommand(
      'claude --version',
      undefined,
      undefined,
      SANDBOX_AGENT_CMD_TIMEOUT_S,
    );
    if (claudeVerifyResponse.exitCode !== 0) {
      throw new Error(`Claude Code CLI verification failed: ${claudeVerifyResponse.result}`);
    }
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
}
