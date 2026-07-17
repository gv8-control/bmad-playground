import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type {
  ISandboxService,
  ProvisionParams,
  SandboxInfo,
  GitUserConfig,
  WorkingTreeStatus,
  SkillInfo,
  AgentSessionHandle,
} from '@bmad-easy/shared-types';
import { DaytonaError, DaytonaNotFoundError, type Daytona, type Sandbox } from '@daytonaio/sdk';
import { DAYTONA_CLIENT } from './daytona-client.provider';

const REPO_SUBDIRECTORY = 'repo';

/**
 * Path to the sandbox-agent binary on the agent-be host. Overridable via the
 * `SANDBOX_AGENT_PATH` env var; defaults to `/opt/sandbox-agent`, the path
 * baked into the agent-be Docker image (downloaded + checksum-verified at
 * Docker build time — see Dockerfile). For local dev (nx serve) the binary
 * is not at that path — run `scripts/download-sandbox-agent.sh` to download
 * the pinned binary, then either leave the var unset (if the script placed
 * it at /opt/sandbox-agent) or point it to your local download path.
 * Uploaded to the sandbox during provision.
 */
const SANDBOX_AGENT_LOCAL_PATH = process.env.SANDBOX_AGENT_PATH ?? '/opt/sandbox-agent';

/**
 * Remote path inside the sandbox where the sandbox-agent binary is placed
 * and made executable.
 */
const SANDBOX_AGENT_REMOTE_PATH = '/usr/local/bin/sandbox-agent';

/**
 * Temp upload path inside the sandbox. `/usr/local/bin/` is not writable by
 * the Daytona sandbox's default user, so the binary is uploaded here first
 * (always writable) and then moved to `SANDBOX_AGENT_REMOTE_PATH` via
 * `sudo install -m 755`, which atomically copies and sets permissions.
 */
const SANDBOX_AGENT_TEMP_PATH = '/tmp/sandbox-agent-upload';

/**
 * Pinned exact version of the Claude Code CLI installed inside the sandbox
 * via `npm install -g`. No floating tags — pre-1.0/exact-version discipline.
 * The architecture's Dockerfile-pinning requirement (line 76/673) is scoped to
 * sandbox-agent specifically; Claude Code is distributed as an npm package,
 * so a module-level constant is the simplest reversible option (DP-3).
 */
const CLAUDE_CODE_VERSION = '2.1.210';

/**
 * Timeout (seconds) for short binary-install commands (sudo install, --version
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

/**
 * Timeout (seconds) for `executeSessionCommand` (the async start of
 * sandbox-agent, not the long-lived log stream). The async start should
 * return quickly (it just launches the process); 30s is a generous upper
 * bound that prevents a stalled start from blocking the event bridge.
 * Distinct from the circuit breaker (per-active-run timer that resets on
 * events) — this is a per-call timeout. The `getSessionCommandLogs` streaming
 * call is long-lived by design — no timeout on it (the circuit breaker
 * handles stall detection).
 */
const SESSION_COMMAND_TIMEOUT_S = 30;

@Injectable()
export class SandboxService implements ISandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly conversationIdBySandbox = new Map<string, string>();

  constructor(@Inject(DAYTONA_CLIENT) private readonly daytona: Daytona) {}

  /**
   * Returns a log-context suffix for a sandboxId — ` (conversation <id>)` when
   * the sandbox→conversation mapping is known, empty string when it isn't.
   * Populated by provision() and resume(); cleared by destroy().
   */
  private logCtx(sandboxId: string): string {
    const convId = this.conversationIdBySandbox.get(sandboxId);
    return convId ? ` (conversation ${convId})` : '';
  }

  async provision(params: ProvisionParams): Promise<SandboxInfo> {
    // Fail fast before allocating any Daytona resource — env validation guards
    // this at boot, but an explicit guard here prevents a silent empty-key
    // injection if the var is unset at provision time (AC-5 loud-failure intent).
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured — cannot provision sandbox');
    }

    // null-fallback + cleanup-on-failure: if create() throws after partial
    // allocation, or installBinaries() throws after create() succeeds, clean
    // up the allocated sandbox before re-throwing so the failure does not leak
    // a zombie sandbox (the caller's catch cannot clean up because provision()
    // rejects before returning the sandbox id).
    let sandbox: Sandbox | null = null;
    try {
      sandbox = await this.daytona.create({
        labels: { conversationId: params.conversationId },
        envVars: {
          ANTHROPIC_API_KEY: anthropicApiKey,
          GITHUB_TOKEN: params.credential,
        },
      });
      this.conversationIdBySandbox.set(sandbox.id, params.conversationId);
      await this.installBinaries(sandbox);
      return {
        sandboxId: sandbox.id,
        conversationId: params.conversationId,
        status: 'ready',
        provisionedAt: new Date(),
      };
    } catch (err) {
      if (sandbox) {
        const sandboxId = sandbox.id;
        try {
          await this.daytona.delete(sandbox);
        } catch (cleanupErr) {
          this.logger.error(
            `Failed to clean up sandbox ${sandboxId}${this.logCtx(sandboxId)} after provision failure: ${cleanupErr}`,
          );
        }
      }
      throw err;
    }
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
    const sandbox = await this.getSandbox(sandboxId);
    await this.daytona.start(sandbox);
    const conversationId = sandbox.labels?.conversationId || sandboxId;
    this.conversationIdBySandbox.set(sandboxId, conversationId);
    return {
      sandboxId: sandbox.id,
      conversationId,
      status: 'ready',
      provisionedAt: new Date(),
    };
  }

  async destroy(sandboxId: string): Promise<void> {
    this.conversationIdBySandbox.delete(sandboxId);
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
      // git config writes failure diagnostics to stderr; the SDK's
      // ExecuteResponse.result is stdout-only, so it may be empty.
      // Fall back to a diagnostic that includes the exit code (F4 pattern).
      throw new Error(
        nameResponse.result || `git config user.name failed (exit code ${nameResponse.exitCode})`,
      );
    }
    const emailResponse = await sandbox.process.executeCommand(
      `git config user.email ${this.shellQuote(config.email)}`,
      REPO_SUBDIRECTORY,
      undefined,
      10,
    );
    if (emailResponse.exitCode !== 0) {
      throw new Error(
        emailResponse.result || `git config user.email failed (exit code ${emailResponse.exitCode})`,
      );
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
      // git add writes failure diagnostics to stderr; the SDK's
      // ExecuteResponse.result is stdout-only, so it is empty for git add
      // failures. Fall back to a diagnostic that surfaces the exit code so
      // ManualCommitService reports MANUAL_SAVE_FAILED with actionable info
      // instead of an empty error string (F4 fidelity-audit fix).
      throw new Error(
        addResponse.result || `git add failed (exit code ${addResponse.exitCode})`,
      );
    }
    const response = await sandbox.process.executeCommand(
      `git commit -m ${this.shellQuote(message)}`,
      REPO_SUBDIRECTORY,
      undefined,
      10,
    );
    if (response.exitCode !== 0) {
      throw new Error(
        response.result || `git commit failed (exit code ${response.exitCode})`,
      );
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
      // Non-zero exit code means "no skills" (or "can't read skills"),
      // regardless of stdout content. A failed `ls` could write to stdout
      // in a failure mode; without this gate the parsing below would return
      // junk SkillInfo entries (F5 fidelity-audit fix).
      if (response.exitCode !== 0) {
        // Surface the failure to operators — a silent [] here is
        // indistinguishable from "no skills installed" (F5 operator-signal fix).
        this.logger.warn(
          `listSkills ls failed for sandbox ${sandboxId}${this.logCtx(sandboxId)} (exit code ${response.exitCode})`,
        );
        return [];
      }
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
      this.logger.warn(`listSkills failed for sandbox ${sandboxId}${this.logCtx(sandboxId)}: ${err}`);
      return [];
    }
  }

  private async getSandbox(sandboxId: string): Promise<Sandbox> {
    return this.daytona.get(sandboxId);
  }

  /**
   * Installs the sandbox-agent binary (uploaded from the agent-be image) and
   * the Claude Code CLI (npm global install) inside the sandbox, then verifies
   * both are executable. Throws on any failure — a sandbox without the binaries
   * cannot run the agent. All paths and versions are constants (no user input).
   */
  private async installBinaries(sandbox: Sandbox): Promise<void> {
    // `/usr/local/bin/` is not writable by the Daytona sandbox's default user,
    // and `sandbox.fs.uploadFile` runs as that user (bulk upload endpoint).
    // Upload to the always-writable /tmp first, then `sudo install` to the
    // final destination — `install` atomically copies and sets permissions.
    await sandbox.fs.uploadFile(
      SANDBOX_AGENT_LOCAL_PATH,
      SANDBOX_AGENT_TEMP_PATH,
      SANDBOX_UPLOAD_TIMEOUT_S,
    );

    const installResponse = await sandbox.process.executeCommand(
      `sudo install -m 755 ${SANDBOX_AGENT_TEMP_PATH} ${SANDBOX_AGENT_REMOTE_PATH}`,
      undefined,
      undefined,
      SANDBOX_AGENT_CMD_TIMEOUT_S,
    );
    if (installResponse.exitCode !== 0) {
      // install writes failure diagnostics to stderr; the SDK's
      // ExecuteResponse.result is stdout-only, so it may be empty.
      // Fall back to a diagnostic that includes the exit code (F4 pattern,
      // matching injectGitConfig() and commit()).
      throw new Error(
        installResponse.result || `Failed to install sandbox-agent binary (exit code ${installResponse.exitCode})`,
      );
    }

    const npmInstallResponse = await sandbox.process.executeCommand(
      `sudo -E env "PATH=$PATH" npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`,
      undefined,
      undefined,
      SANDBOX_NPM_INSTALL_TIMEOUT_S,
    );
    if (npmInstallResponse.exitCode !== 0) {
      // npm writes failure diagnostics to stderr; result is stdout-only.
      // Fall back to a diagnostic that includes the exit code (F4 pattern).
      throw new Error(
        npmInstallResponse.result || `Failed to install Claude Code CLI (exit code ${npmInstallResponse.exitCode})`,
      );
    }

    const agentVerifyResponse = await sandbox.process.executeCommand(
      `${SANDBOX_AGENT_REMOTE_PATH} --version`,
      undefined,
      undefined,
      SANDBOX_AGENT_CMD_TIMEOUT_S,
    );
    if (agentVerifyResponse.exitCode !== 0) {
      // Binary verification writes diagnostics to stderr; result is stdout-only.
      // Fall back to a diagnostic that includes the exit code (F4 pattern).
      throw new Error(
        agentVerifyResponse.result || `sandbox-agent binary verification failed (exit code ${agentVerifyResponse.exitCode})`,
      );
    }

    const claudeVerifyResponse = await sandbox.process.executeCommand(
      'claude --version',
      undefined,
      undefined,
      SANDBOX_AGENT_CMD_TIMEOUT_S,
    );
    if (claudeVerifyResponse.exitCode !== 0) {
      // claude --version writes diagnostics to stderr; result is stdout-only.
      // Fall back to a diagnostic that includes the exit code (F4 pattern).
      throw new Error(
        claudeVerifyResponse.result || `Claude Code CLI verification failed (exit code ${claudeVerifyResponse.exitCode})`,
      );
    }
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  // ─── Story 6.2 — process session lifecycle methods ─────────────────────
  // Encapsulate the Daytona process session API (createSession,
  // executeSessionCommand, getSessionCommandLogs, deleteSession). The event
  // bridge calls through ISandboxService for all process session operations —
  // SandboxService is the sole Daytona SDK boundary (architecture: "apps/agent-be
  // is the sole initiating party toward Daytona").

  async createAgentSession(sandboxId: string, command: string, cwd?: string): Promise<AgentSessionHandle> {
    const sandbox = await this.getSandbox(sandboxId);
    const sessionId = `agent-${sandboxId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await sandbox.process.createSession(sessionId);
    const effectiveCommand = cwd ? `cd ${this.shellQuote(cwd)} && ${command}` : command;
    // executeSessionCommand runs AFTER createSession succeeds — if it throws,
    // the session is already created in Daytona. Clean it up before re-throwing
    // so the failure does not leak a zombie session (the caller's catch cannot
    // clean up because the session ID is never returned on failure).
    try {
      const response = await sandbox.process.executeSessionCommand(
        sessionId,
        { command: effectiveCommand, runAsync: true },
        SESSION_COMMAND_TIMEOUT_S,
      );
      return { sessionId, commandId: response.cmdId };
    } catch (err) {
      await sandbox.process.deleteSession(sessionId).catch((deleteErr) => {
        this.logger.error(
          `Failed to clean up session ${sessionId} after executeSessionCommand failure${this.logCtx(sandboxId)}: ${deleteErr}`,
        );
      });
      throw err;
    }
  }

  async streamAgentLogs(
    sandboxId: string,
    handle: AgentSessionHandle,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
  ): Promise<void> {
    const sandbox = await this.getSandbox(sandboxId);
    await sandbox.process.getSessionCommandLogs(
      handle.sessionId,
      handle.commandId,
      onStdout,
      onStderr,
    );
  }

  async terminateAgentSession(_sandboxId: string, sessionId: string): Promise<void> {
    const sandbox = await this.getSandbox(_sandboxId);
    try {
      await sandbox.process.deleteSession(sessionId);
    } catch (err) {
      // F1 idempotency pattern from Story 6.1: deleteSession on an
      // already-deleted session returns void (no-op). Non-404 errors propagate.
      if (
        err instanceof DaytonaNotFoundError ||
        (err instanceof DaytonaError && err.statusCode === 404)
      ) {
        return;
      }
      throw err;
    }
  }
}
