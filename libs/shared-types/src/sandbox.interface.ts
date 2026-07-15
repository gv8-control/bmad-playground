export interface ProvisionParams {
  conversationId: string;
  repoUrl: string;
  credential: string;
}

export interface SandboxInfo {
  sandboxId: string;
  conversationId: string;
  status: 'running' | 'stopped' | 'ready';
  provisionedAt?: Date;
}

export interface GitUserConfig {
  name: string;
  email: string;
}

export interface WorkingTreeStatus {
  dirty: boolean;
  files: string[];
}

export interface SkillInfo {
  name: string;
}

/**
 * Handle returned by createAgentSession — identifies a running sandbox-agent
 * process session inside a Daytona sandbox. Used by streamAgentLogs and
 * terminateAgentSession to manage the session lifecycle.
 *
 * Story 6.2 test seam — the event bridge calls through ISandboxService for
 * all process session operations (SandboxService is the sole Daytona SDK
 * boundary per architecture: "apps/agent-be is the sole initiating party
 * toward Daytona").
 */
export interface AgentSessionHandle {
  sessionId: string;
  commandId: string;
}

export interface ISandboxService {
  provision(params: ProvisionParams): Promise<SandboxInfo>;
  clone(sandboxId: string, repoUrl: string, credential: string): Promise<void>;
  resume(sandboxId: string): Promise<SandboxInfo>;
  destroy(sandboxId: string): Promise<void>;
  injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void>;
  getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus>;
  commit(sandboxId: string, message: string): Promise<void>;
  listSkills(sandboxId: string): Promise<SkillInfo[]>;

  /**
   * Creates a Daytona process session, runs the sandbox-agent command
   * asynchronously, and returns the session/command IDs.
   *
   * Story 6.2 — encapsulates createSession + executeSessionCommand(runAsync: true).
   * The command is the sandbox-agent invocation string (constructed by the
   * caller — AgentService in Story 6.3). SandboxService does NOT construct or
   * shell-quote the command; it passes it through to the Daytona SDK.
   */
  createAgentSession(sandboxId: string, command: string, cwd?: string): Promise<AgentSessionHandle>;

  /**
   * Streams sandbox-agent output via getSessionCommandLogs (4-arg callback
   * overload). Calls onStdout/onStderr with output chunks; resolves when the
   * command completes.
   *
   * Story 6.2 — the event bridge's onStdout callback re-encodes chunks as
   * AG-UI events via SessionEventsService.emit().
   */
  streamAgentLogs(
    sandboxId: string,
    handle: AgentSessionHandle,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
  ): Promise<void>;

  /**
   * Terminates the sandbox-agent process session via deleteSession.
   * Idempotent — returns void on already-deleted sessions (F1 pattern from
   * Story 6.1: catch DaytonaNotFoundError, return void).
   *
   * Story 6.2 — called by the event bridge's circuit breaker on timeout and
   * by stop() for user-initiated cancellation.
   */
  terminateAgentSession(sandboxId: string, sessionId: string): Promise<void>;
}

export const SANDBOX_SERVICE = Symbol('ISandboxService');
