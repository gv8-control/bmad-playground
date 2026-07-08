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
  private readonly clonedSandboxes = new Set<string>();
  private provisionDelay = 0;
  private shouldFailNextProvision = false;
  private shouldFailNextClone = false;
  private shouldFailNextCommit = false;
  private skills: SkillInfo[] = [];
  private sandboxCounter = 0;
  private readonly commitCalls: Array<{ sandboxId: string; message: string; author?: GitUserConfig }> = [];
  private readonly cloneCalls: Array<{ sandboxId: string; repoUrl: string; credential: string }> = [];

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

  /** Inspection: list of clone() calls made (repoUrl and credential passed). */
  getCloneCalls(): Array<{ sandboxId: string; repoUrl: string; credential: string }> {
    return [...this.cloneCalls];
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

  /** Inspection: list of sandbox IDs that have been cloned. */
  getClonedSandboxes(): string[] {
    return [...this.clonedSandboxes];
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

  /**
   * Models the sandbox.git.clone() boundary (fidelity remediation item 6).
   *
   * Tracks call arguments for inspection and models the "already cloned"
   * failure mode — calling clone() twice on the same sandbox throws, matching
   * the real `git clone` into a non-empty directory behavior.
   *
   * NOTE: this does NOT exercise the real SandboxService.clone() logic. The
   * real clone logic is tested in sandbox.service.nfr-s1.spec.ts against a
   * mock Daytona client. Integration tests using this fake verify the
   * provision pipeline wiring (provision → clone → injectGitConfig → status),
   * not the clone implementation itself.
   */
  async clone(sandboxId: string, repoUrl: string, credential: string): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    if (this.shouldFailNextClone) {
      this.shouldFailNextClone = false;
      throw new Error('SandboxServiceFake: simulated clone failure');
    }
    if (this.clonedSandboxes.has(sandboxId)) {
      throw new Error(`SandboxServiceFake: sandbox ${sandboxId} already cloned — destination path already exists`);
    }
    this.cloneCalls.push({ sandboxId, repoUrl, credential });
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

  async destroy(sandboxId: string): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    this.sandboxes.delete(sandboxId);
    this.injectedGitConfigs.delete(sandboxId);
    this.clonedSandboxes.delete(sandboxId);
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

  async executeCommand(
    sandboxId: string,
    command: string,
  ): Promise<{ exitCode: number; result: string; artifacts?: { stdout: string } }> {
    if (!this.sandboxes.has(sandboxId)) {
      throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    }
    const output = `fake output for: ${command}`;
    return { exitCode: 0, result: output, artifacts: { stdout: output } };
  }

  async listSkills(_sandboxId: string): Promise<SkillInfo[]> {
    return this.skills;
  }

  /** Inspection: sandboxes currently provisioned. */
  activeSandboxCount(): number {
    return this.sandboxes.size;
  }
}
