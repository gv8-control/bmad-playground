import { Injectable } from '@nestjs/common';
import type {
  ISandboxService,
  ProvisionParams,
  SandboxInfo,
  GitUserConfig,
  WorkingTreeStatus,
  SkillInfo,
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
  private provisionDelay = 0;
  private shouldFailNextProvision = false;
  private shouldFailNextClone = false;
  private shouldFailNextCommit = false;
  private skills: SkillInfo[] = [];
  private sandboxCounter = 0;
  private readonly commitCalls: Array<{ sandboxId: string; message: string; author?: GitUserConfig }> = [];

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

  /** Control hook: cause the next clone() call to throw. */
  failNextClone(): void {
    this.shouldFailNextClone = true;
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
    return sandbox;
  }

  async clone(sandboxId: string, _repoUrl: string, _credential: string): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    if (this.shouldFailNextClone) {
      this.shouldFailNextClone = false;
      throw new Error('SandboxServiceFake: simulated clone failure');
    }
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

  async destroy(sandboxId: string): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    this.sandboxes.delete(sandboxId);
    this.injectedGitConfigs.delete(sandboxId);
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

  async terminateProcess(sandboxId: string, _processId: string): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
  }

  async getStatus(sandboxId: string): Promise<SandboxInfo | null> {
    return this.sandboxes.get(sandboxId) ?? null;
  }

  async executeCommand(sandboxId: string, command: string): Promise<{ stdout: string; exitCode: number }> {
    if (!this.sandboxes.has(sandboxId)) {
      throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    }
    return { stdout: `fake output for: ${command}`, exitCode: 0 };
  }

  async listSkills(_sandboxId: string): Promise<SkillInfo[]> {
    return this.skills;
  }

  /** Inspection: sandboxes currently provisioned. */
  activeSandboxCount(): number {
    return this.sandboxes.size;
  }
}
