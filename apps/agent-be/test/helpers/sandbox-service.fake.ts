import { Injectable } from '@nestjs/common';
import type {
  ISandboxService,
  ProvisionParams,
  SandboxInfo,
  GitUserConfig,
  WorkingTreeStatus,
} from '@bmad-easy/shared-types';

/**
 * In-memory SandboxService fake for unit and integration tests.
 * Injected via the SANDBOX_SERVICE DI token in Test.createTestingModule().
 * Mirrors the interface defined in libs/shared-types/src/sandbox.interface.ts (B-01).
 */
@Injectable()
export class SandboxServiceFake implements ISandboxService {
  private readonly sandboxes = new Map<string, SandboxInfo>();
  private provisionDelay = 0;
  private shouldFailNextProvision = false;

  /** Control hook: simulate a slow provision (milliseconds). */
  setProvisionDelay(ms: number): void {
    this.provisionDelay = ms;
  }

  /** Control hook: cause the next provision() call to throw. */
  failNextProvision(): void {
    this.shouldFailNextProvision = true;
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
      sandboxId: `fake-sandbox-${Date.now()}`,
      conversationId: params.conversationId,
      status: 'ready',
      provisionedAt: new Date(),
    };

    this.sandboxes.set(sandbox.sandboxId, sandbox);
    return sandbox;
  }

  async clone(sandboxId: string, _repoUrl: string, _credential: string): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
  }

  async resume(sandboxId: string): Promise<SandboxInfo> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    return { ...sandbox, status: 'ready' };
  }

  async destroy(sandboxId: string): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    this.sandboxes.delete(sandboxId);
  }

  async injectGitConfig(sandboxId: string, _config: GitUserConfig): Promise<void> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
  }

  async getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus> {
    if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
    return { dirty: false, files: [] };
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

  /** Inspection: sandboxes currently provisioned. */
  activeSandboxCount(): number {
    return this.sandboxes.size;
  }
}
