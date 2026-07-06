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

export interface ISandboxService {
  provision(params: ProvisionParams): Promise<SandboxInfo>;
  clone(sandboxId: string, repoUrl: string, credential: string): Promise<void>;
  resume(sandboxId: string): Promise<SandboxInfo>;
  destroy(sandboxId: string): Promise<void>;
  injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void>;
  getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus>;
  commit(sandboxId: string, message: string): Promise<void>;
  terminateProcess(sandboxId: string, processId: string): Promise<void>;
  listSkills(sandboxId: string): Promise<SkillInfo[]>;
}

export const SANDBOX_SERVICE = Symbol('ISandboxService');
