import { Injectable } from '@nestjs/common';
import type {
  ISandboxService,
  ProvisionParams,
  SandboxInfo,
  GitUserConfig,
  WorkingTreeStatus,
  SkillInfo,
  AgentSessionHandle,
} from '@bmad-easy/shared-types';

/**
 * In-memory SandboxService fake for unit and integration tests.
 * Injected via the SANDBOX_SERVICE DI token in Test.createTestingModule().
 * Mirrors the interface defined in libs/shared-types/src/sandbox.interface.ts (B-01).
 */
@Injectable()
export class SandboxServiceFake implements ISandboxService {
  private readonly sandboxes = new Map<string, SandboxInfo>();
  private readonly injectedGitConfigs = new Map<string, GitUserConfig>();
  private readonly clonedSandboxes = new Set<string>();
  private readonly binariesInstalled = new Set<string>();
  private readonly provisionedEnvVars = new Map<string, Record<string, string>>();
  private readonly provisionedNetworkAllowLists = new Map<string, string>();
  private provisionDelay = 0;
  private shouldFailNextProvision = false;
  private shouldFailNextCommit = false;
  private skills: SkillInfo[] = [];
  private sandboxCounter = 0;
  private readonly commitCalls: Array<{ sandboxId: string; message: string; author?: GitUserConfig }> = [];

  // ─── Story 6.2 test seam — process session lifecycle state ──────────────
  private readonly createdSessions: Array<{ sandboxId: string; sessionId: string; command: string; cwd?: string }> = [];
  private readonly terminatedSessions: Array<{ sandboxId: string; sessionId: string }> = [];
  private agentEvents: string[] = [];
  private agentStderrEvents: string[] = [];
  private agentStreamDelay = 0;
  private shouldFailNextAgentStream = false;
  private sessionCounter = 0;

  /** Control hook: simulate a slow provision (milliseconds). */
  setProvisionDelay(ms: number): void {
    this.provisionDelay = ms;
  }

  /** Control hook: cause the next provision() call to throw. */
  failNextProvision(): void {
    this.shouldFailNextProvision = true;
  }

  /** Control hook: set the skills list returned by listSkills(). */
  setSkills(skills: SkillInfo[]): void {
    this.skills = skills;
  }

  /** Control hook: cause the next commit() call to throw. */
  failNextCommit(): void {
    this.shouldFailNextCommit = true;
  }

  /** Inspection: list of commit() calls made. */
  getCommitCalls(): Array<{ sandboxId: string; message: string; author?: GitUserConfig }> {
    return [...this.commitCalls];
  }

  /** Inspection: the git config last injected for a sandbox. */
  getInjectedGitConfig(sandboxId: string): GitUserConfig | undefined {
    const config = this.injectedGitConfigs.get(sandboxId);
    return config ? { ...config } : undefined;
  }

  /** Inspection: whether clone() has succeeded for a sandbox (repo is present). */
  isCloned(sandboxId: string): boolean {
    return this.clonedSandboxes.has(sandboxId);
  }

  /**
   * Inspection: whether binaries were installed during provision (AC-1).
   * Story 6.1 test seam — the fake simulates the binary-install side effect
   * that the real SandboxService.provision() performs.
   */
  areBinariesInstalled(sandboxId: string): boolean {
    return this.binariesInstalled.has(sandboxId);
  }

  /**
   * Inspection: env vars injected during provision (AC-2).
   * Story 6.1 test seam — the fake simulates the envVars that the real
   * SandboxService.provision() passes to daytona.create().
   */
  getProvisionedEnvVars(sandboxId: string): Record<string, string> | undefined {
    const envVars = this.provisionedEnvVars.get(sandboxId);
    return envVars ? { ...envVars } : undefined;
  }

  /**
   * Inspection: networkAllowList applied during provision (AC-3).
   * Story 6.1 test seam — the fake simulates the networkAllowList that the
   * real SandboxService.provision() passes to daytona.create().
   */
  getNetworkAllowList(sandboxId: string): string | undefined {
    return this.provisionedNetworkAllowLists.get(sandboxId);
  }

  async provision(params: ProvisionParams): Promise<SandboxInfo> {
    if (this.shouldFailNextProvision) {
      this.shouldFailNextProvision = false;
      throw new Error('SandboxServiceFake: simulated provision failure');
    }

    if (this.provisionDelay > 0) {
      await new Promise((r) => setTimeout(r, this.provisionDelay));
    }

    const sandbox: SandboxInfo = {
      sandboxId: `fake-sandbox-${Date.now()}-${this.sandboxCounter++}`,
      conversationId: params.conversationId,
      status: 'ready',
      provisionedAt: new Date(),
    };

    this.sandboxes.set(sandbox.sandboxId, sandbox);

    // Story 6.1 test seam: simulate the provision side effects that the real
    // SandboxService.provision() performs (binary install, envVars, networkAllowList).
    // The fake does NOT actually install binaries or call daytona.create() — it
    // records what the real service WOULD have done so integration tests can assert.
    this.binariesInstalled.add(sandbox.sandboxId);
    this.provisionedEnvVars.set(sandbox.sandboxId, {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      GITHUB_TOKEN: params.credential,
    });
    this.provisionedNetworkAllowLists.set(sandbox.sandboxId, 'simulated-allow-list');

    return sandbox;
  }

  /**
   * Models the sandbox.git.clone() boundary.
   *
   * Tracks clone state and models the "already cloned" failure mode — calling
   * clone() twice on the same sandbox throws, matching the real `git clone`
   * into a non-empty directory behavior.
   *
   * NOTE: this does NOT exercise the real SandboxService.clone() logic. The
   * real clone logic is tested in sandbox.service.nfr-s1.spec.ts against a
   * mock Daytona client. Integration tests using this fake verify the
   * provision pipeline wiring (provision → clone → injectGitConfig → status),
   * not the clone implementation itself.
   */
  async clone(sandboxId: string, _repoUrl: string, _credential: string): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    if (this.clonedSandboxes.has(sandboxId)) {
      throw new Error(`SandboxServiceFake: sandbox ${sandboxId} already cloned — destination path already exists`);
    }
    this.clonedSandboxes.add(sandboxId);
  }

  async resume(sandboxId: string): Promise<SandboxInfo> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    return {
      sandboxId,
      conversationId: sandbox.conversationId,
      status: 'ready',
      provisionedAt: sandbox.provisionedAt ?? new Date(),
    };
  }

  /**
   * Story 6.1 F1 side effect: destroy() is idempotent — returns void (no-op)
   * when the sandbox isn't tracked, matching the real SandboxService.destroy()
   * contract (which returns void on DaytonaNotFoundError). Previously the fake
   * threw "sandbox not found", which did NOT match the real service's
   * idempotent-destroy behavior and caused spurious failures in integration
   * tests that call destroy() on an already-destroyed sandbox.
   */
  async destroy(sandboxId: string): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) return;
    this.sandboxes.delete(sandboxId);
    this.injectedGitConfigs.delete(sandboxId);
    this.clonedSandboxes.delete(sandboxId);
    this.binariesInstalled.delete(sandboxId);
    this.provisionedEnvVars.delete(sandboxId);
    this.provisionedNetworkAllowLists.delete(sandboxId);
  }

  async injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    this.injectedGitConfigs.set(sandboxId, { ...config });
  }

  async getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    return { dirty: false, files: [] };
  }

  async commit(sandboxId: string, message: string): Promise<void> {
    const author = this.injectedGitConfigs.get(sandboxId);
    this.commitCalls.push({ sandboxId, message, author: author ? { ...author } : undefined });
    if (this.shouldFailNextCommit) {
      this.shouldFailNextCommit = false;
      throw new Error('SandboxServiceFake: simulated commit failure');
    }
  }

  async listSkills(_sandboxId: string): Promise<SkillInfo[]> {
    return this.skills;
  }

  // ─── Story 6.2 test seam — process session lifecycle methods ─────────────
  // These mirror the real SandboxService session methods (createSession +
  // executeSessionCommand + getSessionCommandLogs + deleteSession) without
  // calling the Daytona SDK. The fake reproduces observable side effects that
  // integration tests assert on (session creation, log streaming, termination).

  /** Control hook: set the event chunks that streamAgentLogs delivers via onStdout. */
  setAgentEvents(events: string[]): void {
    this.agentEvents = events;
  }

  /** Control hook: set the stderr chunks that streamAgentLogs delivers via onStderr. */
  setAgentStderrEvents(events: string[]): void {
    this.agentStderrEvents = events;
  }

  /** Control hook: simulate a slow agent stream (delay between chunks in ms). */
  setAgentStreamDelay(ms: number): void {
    this.agentStreamDelay = ms;
  }

  /** Control hook: cause the next streamAgentLogs call to reject mid-stream. */
  failNextAgentStream(): void {
    this.shouldFailNextAgentStream = true;
  }

  /** Inspection: list of createAgentSession calls made. */
  getCreatedSessions(): Array<{ sandboxId: string; sessionId: string; command: string; cwd?: string }> {
    return [...this.createdSessions];
  }

  /** Inspection: list of terminateAgentSession calls made. */
  getTerminatedSessions(): Array<{ sandboxId: string; sessionId: string }> {
    return [...this.terminatedSessions];
  }

  async createAgentSession(sandboxId: string, command: string, cwd?: string): Promise<AgentSessionHandle> {
    const sessionId = `agent-session-${this.sessionCounter++}`;
    const commandId = `agent-cmd-${this.sessionCounter++}`;
    this.createdSessions.push({ sandboxId, sessionId, command, cwd });
    return { sessionId, commandId };
  }

  async streamAgentLogs(
    _sandboxId: string,
    _handle: AgentSessionHandle,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
  ): Promise<void> {
    if (this.shouldFailNextAgentStream) {
      this.shouldFailNextAgentStream = false;
      throw new Error('SandboxServiceFake: simulated agent stream failure');
    }
    // When a stream delay is set, wait before delivering any output — this
    // simulates a stalled agent (no events arriving) so the event bridge's
    // circuit breaker can be exercised even with an empty event list.
    if (this.agentStreamDelay > 0) {
      await new Promise((r) => setTimeout(r, this.agentStreamDelay));
    }
    for (const chunk of this.agentEvents) {
      if (this.agentStreamDelay > 0) {
        await new Promise((r) => setTimeout(r, this.agentStreamDelay));
      }
      onStdout(chunk);
    }
    for (const chunk of this.agentStderrEvents) {
      onStderr(chunk);
    }
  }

  async terminateAgentSession(sandboxId: string, sessionId: string): Promise<void> {
    this.terminatedSessions.push({ sandboxId, sessionId });
  }

  /** Inspection: sandboxes currently provisioned. */
  activeSandboxCount(): number {
    return this.sandboxes.size;
  }
}
