/**
 * @jest-environment node
 *
 * Story 3.8: Track Per-User LLM Spend
 * Story 3.10: Verify Commits Carry the User's Own Identity
 * Story 3.12: Drain Conversations Gracefully on Deploy
 * Post-3.12 fix: clone() and getWorkingTreeStatus() exitCode checks
 * Fidelity remediation item 2: SDK Git service migration — clone() now uses
 *   sandbox.git.clone(url, path, branch?, commitId?, username?, password?)
 *   instead of shelling out via executeCommand. The OAuth token is passed as
 *   the `password` param to the SDK, NOT injected into the URL. This removes
 *   the credential exposure in process args (the original security issue).
 * Fidelity remediation item 8: typed-mock discipline — uses the shared
 *   mock-daytona.ts factory instead of hand-rolled `any` + `as never` casts.
 *
 * NFR-S1 regression guard tests for SandboxService.
 *
 * Covers: AC-3 (platform-internal credentials never injected into Sandbox).
 * Story 3.10 covers: AC-1 (commit attribution regression guards).
 * Story 3.12 covers: AC-1 (resume() returns conversationId from sandbox.labels,
 * not the sandboxId — contract fix for reconnect/resume).
 *
 * These tests verify the EXISTING SandboxService implementation satisfies NFR-S1.
 * They are regression guards — if a future change adds env vars to daytona.create()
 * or interpolates credentials into command strings, these tests fail.
 */
import type { Daytona } from '@daytonaio/sdk';
import { SandboxService } from './sandbox.service';
import {
  createMockDaytonaWithSandbox,
  type MockDaytona,
  type MockSandbox,
} from '../../test/helpers/mock-daytona';

describe('SandboxService NFR-S1 — credential isolation regression guards (Story 3.8 AC-3)', () => {
  let mockDaytona: MockDaytona;
  let mockSandbox: MockSandbox;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona, mockSandbox } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('[P0] provision() — envVars + labels passed to daytona.create() (Story 6.1 security model)', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    });

    afterEach(() => {
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('calls daytona.create() with labels + envVars + networkAllowList — no resources, no metadata', async () => {
      await service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-token',
      });

      expect(mockDaytona.create).toHaveBeenCalledTimes(1);
      const createArg = mockDaytona.create.mock.calls[0][0];
      expect(Object.keys(createArg)).toContain('labels');
      expect(Object.keys(createArg)).toContain('envVars');
      expect(Object.keys(createArg)).toContain('networkAllowList');
      expect(Object.keys(createArg)).not.toContain('resources');
      expect(Object.keys(createArg)).not.toContain('metadata');
    });

    it('labels contain conversationId only — no credentials in labels', async () => {
      await service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-token',
      });

      const createArg = mockDaytona.create.mock.calls[0][0];
      expect(createArg.labels).toEqual({ conversationId: 'conv-1' });
    });

    it('envVars contains ONLY ANTHROPIC_API_KEY and GITHUB_TOKEN — no platform-internal credentials', async () => {
      await service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-token',
      });

      const createArg = mockDaytona.create.mock.calls[0][0];
      const envVarKeys = Object.keys(createArg.envVars ?? {});
      expect(envVarKeys).toContain('ANTHROPIC_API_KEY');
      expect(envVarKeys).toContain('GITHUB_TOKEN');
      expect(envVarKeys).not.toContain('DATABASE_URL');
      expect(envVarKeys).not.toContain('AUTH_SECRET');
      expect(envVarKeys).not.toContain('DAYTONA_API_KEY');
      expect(envVarKeys).not.toContain('DAYTONA_API_URL');
      expect(envVarKeys).not.toContain('CREDENTIAL_ENCRYPTION_KEK');
      expect(envVarKeys.length).toBe(2);
    });
  });

  describe('[P0] clone() — OAuth token passed to SDK git.clone, NOT in URL (item 2 security fix)', () => {
    it('passes the OAuth token as the password param to sandbox.git.clone, not in the URL', async () => {
      await service.clone(
        'sandbox-1',
        'https://github.com/test/repo.git',
        'fake-oauth-token',
      );

      expect(mockSandbox.git.clone).toHaveBeenCalledTimes(1);
      const [url, path, , , username, password] = mockSandbox.git.clone.mock.calls[0];
      expect(url).toBe('https://github.com/test/repo.git');
      expect(url).not.toContain('fake-oauth-token');
      expect(url).not.toContain('x-access-token');
      expect(path).toBe('repo');
      expect(username).toBe('x-access-token');
      expect(password).toBe('fake-oauth-token');
    });

    it('does NOT call executeCommand — git operations go through the SDK Git service', async () => {
      await service.clone(
        'sandbox-1',
        'https://github.com/test/repo.git',
        'fake-oauth-token',
      );

      expect(mockSandbox.process.executeCommand).not.toHaveBeenCalled();
    });

    it('credential is NOT passed as an env var to executeCommand', async () => {
      await service.clone(
        'sandbox-1',
        'https://github.com/test/repo.git',
        'fake-oauth-token',
      );

      // clone() no longer calls executeCommand at all — credential never reaches
      // the process execution boundary.
      expect(mockSandbox.process.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('[P0] injectGitConfig() — only name and email', () => {
    it('passes only git config user.name and user.email — no credentials in command string', async () => {
      await service.injectGitConfig('sandbox-1', {
        name: 'Test User',
        email: 'test@example.com',
      });

      expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(2);
      const commands = mockSandbox.process.executeCommand.mock.calls.map(
        (c) => c[0] as string,
      );
      const allCommands = commands.join(' ');
      expect(allCommands).toContain('git config user.name');
      expect(allCommands).toContain('git config user.email');
      expect(allCommands).not.toContain('DATABASE_URL');
      expect(allCommands).not.toContain('AUTH_SECRET');
      expect(allCommands).not.toContain('DAYTONA_API_KEY');
      expect(allCommands).not.toContain('CREDENTIAL_ENCRYPTION_KEK');
      expect(allCommands).not.toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('[P0] commit() — no platform credentials in command string', () => {
    it('git add and git commit commands do not interpolate platform credentials', async () => {
      await service.commit('sandbox-1', 'chore(platform-save): checkpoint [2026-07-06T00:00:00Z]');

      expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(2);
      const commands = mockSandbox.process.executeCommand.mock.calls.map(
        (c) => c[0] as string,
      );
      const allCommands = commands.join(' ');
      expect(allCommands).toContain('git add');
      expect(allCommands).toContain('git commit');
      expect(allCommands).not.toContain('DATABASE_URL');
      expect(allCommands).not.toContain('AUTH_SECRET');
      expect(allCommands).not.toContain('DAYTONA_API_KEY');
      expect(allCommands).not.toContain('CREDENTIAL_ENCRYPTION_KEK');
      expect(allCommands).not.toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('[P1] listSkills() — no credential interpolation', () => {
    it('command string is ls -1 .claude/skills/ — no credential interpolation', async () => {
      mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 0, result: 'skill-1\nskill-2' });

      await service.listSkills('sandbox-1');

      expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(1);
      const command = mockSandbox.process.executeCommand.mock.calls[0][0] as string;
      expect(command).toBe('ls -1 .claude/skills/');
      expect(command).not.toContain('DATABASE_URL');
      expect(command).not.toContain('AUTH_SECRET');
      expect(command).not.toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('[P0] Story 3.10 — commit attribution regression guards (AC-1)', () => {
    it('[P0] commit() command does not include --author', async () => {
      await service.commit('sandbox-1', 'msg');

      const commands = mockSandbox.process.executeCommand.mock.calls.map(
        (c) => c[0] as string,
      );
      const commitCommand = commands.find((cmd: string) => cmd.includes('git commit'));
      expect(commitCommand).toBeDefined();
      expect(commitCommand).not.toContain('--author');
    });

    it('[P0] commit() command does not interpolate a platform service account', async () => {
      await service.commit('sandbox-1', 'msg');

      const commands = mockSandbox.process.executeCommand.mock.calls.map(
        (c) => c[0] as string,
      );
      const allCommands = commands.join(' ');
      expect(allCommands).not.toMatch(/--author=|bmad-easy|platform@/);
    });

    it('[P0] injectGitConfig() sets BOTH user.name and user.email', async () => {
      await service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' });

      const commands = mockSandbox.process.executeCommand.mock.calls.map(
        (c) => c[0] as string,
      );
      expect(commands.some((cmd: string) => cmd.includes('git config user.name'))).toBe(true);
      expect(commands.some((cmd: string) => cmd.includes('git config user.email'))).toBe(true);
    });

    it('[P0] injectGitConfig() throws when git config fails (Task 1 fix)', async () => {
      mockSandbox.process.executeCommand.mockResolvedValueOnce({ exitCode: 1, result: 'git config failed' });

      await expect(
        service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' }),
      ).rejects.toThrow('git config failed');
    });

    it('[P0] injectGitConfig() throws when git config user.email fails (name succeeds, email fails)', async () => {
      mockSandbox.process.executeCommand
        .mockResolvedValueOnce({ exitCode: 0, result: '' })
        .mockResolvedValueOnce({ exitCode: 1, result: 'email config failed' });

      await expect(
        service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' }),
      ).rejects.toThrow('email config failed');
    });

    // NFR-1 (Story 6.4 audit): injectGitConfig() has the same empty-error-message
    // bug that commit() had (F4). git config writes failures to stderr; the SDK's
    // ExecuteResponse.result is stdout-only, so result is empty on failure.
    // The || fallback surfaces the exit code instead of throwing Error('').
    it('[P0] injectGitConfig() throws a non-empty diagnostic (incl. exit code) when git config user.name fails with empty result', async () => {
      mockSandbox.process.executeCommand.mockResolvedValueOnce({ exitCode: 1, result: '' });

      await expect(
        service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' }),
      ).rejects.toThrow(/exit code 1/);
    });

    it('[P0] injectGitConfig() throws a non-empty diagnostic (incl. exit code) when git config user.email fails with empty result', async () => {
      mockSandbox.process.executeCommand
        .mockResolvedValueOnce({ exitCode: 0, result: '' })
        .mockResolvedValueOnce({ exitCode: 1, result: '' });

      await expect(
        service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' }),
      ).rejects.toThrow(/exit code 1/);
    });
  });

  describe('[P0] clone() — propagates SDK errors (error propagation guard)', () => {
    it('[P0] clone() throws when sandbox.git.clone rejects', async () => {
      mockSandbox.git.clone.mockRejectedValueOnce(new Error('fatal: repository not found'));

      await expect(
        service.clone('sandbox-1', 'https://github.com/test/repo.git', 'fake-token'),
      ).rejects.toThrow('fatal: repository not found');
    });

    it('[P0] clone() does not throw when sandbox.git.clone resolves', async () => {
      await expect(
        service.clone('sandbox-1', 'https://github.com/test/repo.git', 'fake-token'),
      ).resolves.toBeUndefined();
    });

    it('[P0] clone() propagates "destination path" error when directory is not empty (Gap C)', async () => {
      mockSandbox.git.clone.mockRejectedValueOnce(
        new Error("fatal: destination path '.' already exists and is not an empty directory."),
      );

      await expect(
        service.clone('sandbox-1', 'https://github.com/test/repo.git', 'fake-token'),
      ).rejects.toThrow("fatal: destination path '.' already exists and is not an empty directory.");
    });

    it('[P0] clone() passes the repo subdirectory as the path arg, not the sandbox root', async () => {
      await service.clone('sandbox-1', 'https://github.com/test/repo.git', 'fake-token');

      expect(mockSandbox.git.clone).toHaveBeenCalledTimes(1);
      const [, path] = mockSandbox.git.clone.mock.calls[0];
      expect(path).toBe('repo');
    });
  });

  describe('[P0] getWorkingTreeStatus() — SDK git.status() mapping', () => {
    it('[P0] throws when sandbox.git.status rejects', async () => {
      mockSandbox.git.status.mockRejectedValueOnce(new Error('fatal: not a git directory'));

      await expect(
        service.getWorkingTreeStatus('sandbox-1'),
      ).rejects.toThrow('fatal: not a git directory');
    });

    it('[P0] returns clean status when fileStatus is empty', async () => {
      mockSandbox.git.status.mockResolvedValueOnce({
        currentBranch: 'main',
        fileStatus: [],
      });

      await expect(
        service.getWorkingTreeStatus('sandbox-1'),
      ).resolves.toEqual({ dirty: false, files: [] });
    });
  });

  describe('[P0] Story 3.12 — resume() returns correct conversationId (AC: 1, P3)', () => {
    it('[P0] resume() returns conversationId from sandbox.labels, not the sandboxId', async () => {
      mockSandbox.labels = { conversationId: 'conv-from-label' };
      mockDaytona.get.mockResolvedValueOnce(mockSandbox);

      const result = await service.resume('sandbox-1');

      expect(result.conversationId).toBe('conv-from-label');
      expect(result.conversationId).not.toBe('sandbox-1');
    });

    it('[P0] resume() returns the correct sandboxId (distinct from conversationId)', async () => {
      mockSandbox.id = 'sb-123';
      mockSandbox.labels = { conversationId: 'conv-456' };
      mockDaytona.get.mockResolvedValueOnce(mockSandbox);

      const result = await service.resume('sb-123');

      expect(result.sandboxId).toBe('sb-123');
      expect(result.conversationId).toBe('conv-456');
    });

    it('[P0] resume() returns status "ready" after starting the sandbox', async () => {
      mockSandbox.labels = { conversationId: 'conv-1' };
      mockDaytona.get.mockResolvedValueOnce(mockSandbox);

      const result = await service.resume('sandbox-1');

      expect(result.status).toBe('ready');
      expect(mockDaytona.start).toHaveBeenCalledWith(mockSandbox);
    });
  });

  describe('[P1] cwd argument — git config and commit pass explicit repo subdirectory (Gap C)', () => {
    it('[P1] injectGitConfig() passes "repo" as cwd, not undefined', async () => {
      await service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' });

      expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(2);
      for (const call of mockSandbox.process.executeCommand.mock.calls) {
        expect(call[1]).toBe('repo');
      }
    });

    it('[P1] commit() passes "repo" as cwd, not undefined', async () => {
      await service.commit('sandbox-1', 'test message');

      expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(2);
      for (const call of mockSandbox.process.executeCommand.mock.calls) {
        expect(call[1]).toBe('repo');
      }
    });
  });
});

// ============================================================================
// Story 6.1: Install sandbox-agent + Claude Code Binaries in Sandbox During Provision
// Covers: AC-1 (binaries installed), AC-2 (envVars injected), AC-3 (networkAllowList),
//         AC-7 (fidelity audit findings F1, F2, F3).
// ============================================================================

describe('[P0] Story 6.1 AC-2 — provision() injects envVars into daytona.create()', () => {
  let mockDaytona: MockDaytona;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('[P0] passes envVars to daytona.create() alongside labels', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    expect(mockDaytona.create).toHaveBeenCalledTimes(1);
    const createArg = mockDaytona.create.mock.calls[0][0];
    expect(Object.keys(createArg)).toContain('envVars');
  });

  it('[P0] envVars contains ONLY ANTHROPIC_API_KEY and GITHUB_TOKEN — no platform-internal credentials', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const createArg = mockDaytona.create.mock.calls[0][0];
    const envVarKeys = Object.keys(createArg.envVars ?? {});
    expect(envVarKeys).toContain('ANTHROPIC_API_KEY');
    expect(envVarKeys).toContain('GITHUB_TOKEN');
    expect(envVarKeys).not.toContain('DATABASE_URL');
    expect(envVarKeys).not.toContain('AUTH_SECRET');
    expect(envVarKeys).not.toContain('DAYTONA_API_KEY');
    expect(envVarKeys).not.toContain('DAYTONA_API_URL');
    expect(envVarKeys).not.toContain('CREDENTIAL_ENCRYPTION_KEK');
    expect(envVarKeys.length).toBe(2);
  });

  it('[P0] ANTHROPIC_API_KEY value comes from process.env.ANTHROPIC_API_KEY', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const createArg = mockDaytona.create.mock.calls[0][0];
    expect(createArg.envVars.ANTHROPIC_API_KEY).toBe('sk-ant-test-key');
  });

  it('[P0] GITHUB_TOKEN value comes from params.credential (the per-user OAuth token)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'gho-per-user-oauth-token',
    });

    const createArg = mockDaytona.create.mock.calls[0][0];
    expect(createArg.envVars.GITHUB_TOKEN).toBe('gho-per-user-oauth-token');
  });
});

describe('[P0] Story 6.1 AC-3 — provision() applies networkAllowList to daytona.create()', () => {
  let mockDaytona: MockDaytona;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('[P0] passes networkAllowList to daytona.create()', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const createArg = mockDaytona.create.mock.calls[0][0];
    expect(Object.keys(createArg)).toContain('networkAllowList');
  });

  it('[P0] networkAllowList is non-empty (egress restriction activated)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const createArg = mockDaytona.create.mock.calls[0][0];
    expect(createArg.networkAllowList).toBeTruthy();
    expect(typeof createArg.networkAllowList).toBe('string');
    expect(createArg.networkAllowList.length).toBeGreaterThan(0);
  });
});

describe('[P0] Story 6.1 AC-1 — provision() installs sandbox-agent and Claude Code binaries', () => {
  let mockDaytona: MockDaytona;
  let mockSandbox: MockSandbox;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona, mockSandbox } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    // Default: all executeCommand calls succeed (exitCode 0)
    mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 0, result: '' });
    mockSandbox.fs.uploadFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('[P0] uploads sandbox-agent binary via sandbox.fs.uploadFile after create', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    expect(mockSandbox.fs.uploadFile).toHaveBeenCalled();
    const uploadCalls = mockSandbox.fs.uploadFile.mock.calls;
    // At least one upload for the sandbox-agent binary
    expect(uploadCalls.length).toBeGreaterThanOrEqual(1);
    // The remote path should point to a binary location
    const remotePaths = uploadCalls.map((c) => c[1] as string);
    expect(remotePaths.some((p) => p.includes('sandbox-agent'))).toBe(true);
  });

  it('[P0] makes sandbox-agent executable via executeCommand(chmod +x ...)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const commands = mockSandbox.process.executeCommand.mock.calls.map(
      (c) => c[0] as string,
    );
    expect(commands.some((cmd) => cmd.includes('chmod') && cmd.includes('+x'))).toBe(true);
  });

  it('[P0] installs Claude Code via executeCommand(npm install -g @anthropic-ai/claude-code@<version>)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const commands = mockSandbox.process.executeCommand.mock.calls.map(
      (c) => c[0] as string,
    );
    const npmInstallCmd = commands.find((cmd) => cmd.includes('npm install') && cmd.includes('claude-code'));
    expect(npmInstallCmd).toBeDefined();
    // Must pin to an exact version (no floating tags like @latest)
    expect(npmInstallCmd).toMatch(/@anthropic-ai\/claude-code@\d+\.\d+\.\d+/);
    expect(npmInstallCmd).not.toContain('@latest');
  });

  it('[P0] verifies both binaries are executable after installation (version/help check)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const commands = mockSandbox.process.executeCommand.mock.calls.map(
      (c) => c[0] as string,
    );
    // At least one command should be a version/help check (--version or --help)
    expect(commands.some((cmd) => cmd.includes('--version') || cmd.includes('--help'))).toBe(true);
  });

  it('[P0] throws when binary installation fails (sandbox without binaries cannot run agent)', async () => {
    mockSandbox.process.executeCommand.mockImplementation((cmd: string) => {
      if (cmd.includes('npm install')) {
        return Promise.resolve({ exitCode: 1, result: 'npm install failed' });
      }
      return Promise.resolve({ exitCode: 0, result: '' });
    });

    await expect(
      service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-oauth-token',
      }),
    ).rejects.toThrow();

    // Review patch: installBinaries runs AFTER create() succeeds, so the
    // sandbox is already allocated — it must be cleaned up on failure (no leak).
    expect(mockDaytona.delete).toHaveBeenCalledTimes(1);
  });

  it('[P0] throws when sandbox-agent upload fails', async () => {
    mockSandbox.fs.uploadFile.mockRejectedValue(new Error('upload failed'));

    await expect(
      service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-oauth-token',
      }),
    ).rejects.toThrow();

    // Review patch: the sandbox created by daytona.create() must be cleaned up
    // when installBinaries fails (upload failure happens after create succeeds).
    expect(mockDaytona.delete).toHaveBeenCalledTimes(1);
  });

  it('[P0] cleans up the sandbox even when daytona.delete itself fails during installBinaries cleanup', async () => {
    mockSandbox.fs.uploadFile.mockRejectedValue(new Error('upload failed'));
    mockDaytona.delete.mockRejectedValue(new Error('delete also failed'));

    await expect(
      service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-oauth-token',
      }),
    ).rejects.toThrow('upload failed');

    // delete was attempted (best-effort) and the original installBinaries error
    // is re-thrown, not the delete error.
    expect(mockDaytona.delete).toHaveBeenCalledTimes(1);
  });
});

describe('[P0] Story 6.1 AC-1 — credential-isolation + input-injection regression guards for binary install commands', () => {
  let mockDaytona: MockDaytona;
  let mockSandbox: MockSandbox;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona, mockSandbox } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 0, result: '' });
    mockSandbox.fs.uploadFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('[P0] binary installation commands do NOT interpolate platform credentials', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const commands = mockSandbox.process.executeCommand.mock.calls.map(
      (c) => c[0] as string,
    );
    const allCommands = commands.join(' ');
    expect(allCommands).not.toContain('DATABASE_URL');
    expect(allCommands).not.toContain('AUTH_SECRET');
    expect(allCommands).not.toContain('DAYTONA_API_KEY');
    expect(allCommands).not.toContain('DAYTONA_API_URL');
    expect(allCommands).not.toContain('CREDENTIAL_ENCRYPTION_KEK');
  });

  it('[P0] ANTHROPIC_API_KEY and GITHUB_TOKEN are NOT interpolated into command strings (injected via envVars only)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'gho-secret-oauth-token',
    });

    const commands = mockSandbox.process.executeCommand.mock.calls.map(
      (c) => c[0] as string,
    );
    const allCommands = commands.join(' ');
    expect(allCommands).not.toContain('sk-ant-test-key');
    expect(allCommands).not.toContain('gho-secret-oauth-token');
    expect(allCommands).not.toContain('ANTHROPIC_API_KEY');
    expect(allCommands).not.toContain('GITHUB_TOKEN');
  });

  it('[P0] chmod and npm install commands use constant paths (no user-controlled input injection)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const commands = mockSandbox.process.executeCommand.mock.calls.map(
      (c) => c[0] as string,
    );
    // No user-controlled values (conversationId, repoUrl, credential) in binary install commands
    const binaryInstallCommands = commands.filter(
      (cmd) => cmd.includes('chmod') || cmd.includes('npm install') || cmd.includes('--version') || cmd.includes('--help'),
    );
    for (const cmd of binaryInstallCommands) {
      expect(cmd).not.toContain('conv-1');
      expect(cmd).not.toContain('github.com');
      expect(cmd).not.toContain('fake-oauth-token');
    }
  });
});

describe('[P0] Story 6.1 NFR — stall-detection timeouts on all installBinaries operations', () => {
  // NFR: every long-running sandbox operation that could stall must have a
  // timeout so it cannot block provision() (and the per-user provisionQueue
  // lock) indefinitely. project-context.md mandates timeouts on long-running
  // sandbox operations. These regression guards ensure a future refactor
  // cannot silently drop the timeout arg — the stall-detection guarantee
  // would become untested otherwise.
  let mockDaytona: MockDaytona;
  let mockSandbox: MockSandbox;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona, mockSandbox } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 0, result: '' });
    mockSandbox.fs.uploadFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('[P0] uploadFile passes a positive numeric timeout (no unbounded upload)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    expect(mockSandbox.fs.uploadFile).toHaveBeenCalledTimes(1);
    const uploadTimeout = mockSandbox.fs.uploadFile.mock.calls[0][2];
    expect(typeof uploadTimeout).toBe('number');
    expect(uploadTimeout).toBeGreaterThan(0);
  });

  it('[P0] every executeCommand in installBinaries passes a positive numeric timeout (4th arg)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    // installBinaries issues 4 executeCommand calls: chmod, npm install,
    // sandbox-agent --version, claude --version. Every one must have a timeout.
    const calls = mockSandbox.process.executeCommand.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      const timeout = call[3];
      expect(typeof timeout).toBe('number');
      expect(timeout).toBeGreaterThan(0);
    }
  });

  it('[P0] npm install timeout is larger than the short-command timeout (longer budget for global install)', async () => {
    await service.provision({
      conversationId: 'conv-1',
      repoUrl: 'https://github.com/test/repo.git',
      credential: 'fake-oauth-token',
    });

    const calls = mockSandbox.process.executeCommand.mock.calls;
    const npmCall = calls.find((c) => (c[0] as string).includes('npm install'));
    const chmodCall = calls.find((c) => (c[0] as string).includes('chmod'));
    expect(npmCall).toBeDefined();
    expect(chmodCall).toBeDefined();
    expect((npmCall![3] as number)).toBeGreaterThan((chmodCall![3] as number));
  });
});

describe('[P0] Story 6.1 NFR — provision() fails fast when ANTHROPIC_API_KEY is missing', () => {
  // NFR: AC-5 loud-failure intent. Env validation guards this at boot, but the
  // runtime guard in provision() is defense-in-depth — it must throw BEFORE
  // allocating any Daytona resource so a missing key cannot silently inject an
  // empty string and cause silent auth failures later. This test guards against
  // a future change removing the runtime guard.
  let mockDaytona: MockDaytona;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('[P0] provision() throws before calling daytona.create() when ANTHROPIC_API_KEY is unset', async () => {
    await expect(
      service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-oauth-token',
      }),
    ).rejects.toThrow('ANTHROPIC_API_KEY is not configured');

    expect(mockDaytona.create).not.toHaveBeenCalled();
  });
});

describe('[P0] Story 6.1 AC-7 F1 — destroy() uses typed DaytonaNotFoundError (not string heuristic)', () => {
  let mockDaytona: MockDaytona;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('[P0] destroy() returns void (idempotent) when daytona.get rejects with DaytonaNotFoundError', async () => {
    const { DaytonaNotFoundError } = require('@daytonaio/sdk');
    mockDaytona.get.mockRejectedValueOnce(new DaytonaNotFoundError('Sandbox not found'));

    await expect(service.destroy('nonexistent-sandbox')).resolves.toBeUndefined();
    expect(mockDaytona.delete).not.toHaveBeenCalled();
  });

  it('[P0] destroy() re-throws when daytona.get rejects with a non-404 DaytonaError (e.g. DaytonaAuthorizationError 403)', async () => {
    const { DaytonaAuthorizationError } = require('@daytonaio/sdk');
    mockDaytona.get.mockRejectedValueOnce(new DaytonaAuthorizationError('Forbidden'));

    await expect(service.destroy('sandbox-1')).rejects.toThrow('Forbidden');
    expect(mockDaytona.delete).not.toHaveBeenCalled();
  });

  it('[P0] destroy() re-throws when daytona.get rejects with a generic Error (not a DaytonaError)', async () => {
    mockDaytona.get.mockRejectedValueOnce(new Error('Network failure'));

    await expect(service.destroy('sandbox-1')).rejects.toThrow('Network failure');
  });
});

describe('[P0] Story 6.1 AC-7 F2 — provision() dead catch-block cleanup branch removed', () => {
  let mockDaytona: MockDaytona;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('[P0] provision() does NOT call daytona.delete when daytona.create rejects (no partial allocation cleanup)', async () => {
    mockDaytona.create.mockRejectedValueOnce(new Error('create failed'));

    await expect(
      service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-oauth-token',
      }),
    ).rejects.toThrow('create failed');

    // The dead cleanup branch (if (sandbox) { await daytona.delete(sandbox) }) must be gone —
    // daytona.create rejects before assigning the sandbox, so there is nothing to delete.
    expect(mockDaytona.delete).not.toHaveBeenCalled();
  });

  it('[P0] provision() propagates the create() rejection error to the caller', async () => {
    mockDaytona.create.mockRejectedValueOnce(new Error('quota exceeded'));

    await expect(
      service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-oauth-token',
      }),
    ).rejects.toThrow('quota exceeded');
  });
});

describe('[P0] Story 6.1 AC-7 F3 — resume() propagates start() failure to caller', () => {
  let mockDaytona: MockDaytona;
  let mockSandbox: MockSandbox;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona, mockSandbox } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('[P0] resume() propagates error when daytona.start rejects (DaytonaTimeoutError)', async () => {
    const { DaytonaTimeoutError } = require('@daytonaio/sdk');
    mockDaytona.get.mockResolvedValueOnce(mockSandbox);
    mockDaytona.start.mockRejectedValueOnce(new DaytonaTimeoutError('Sandbox failed to start'));

    await expect(service.resume('sandbox-1')).rejects.toThrow('Sandbox failed to start');
  });

  it('[P0] resume() does NOT call daytona.start when daytona.get rejects', async () => {
    const { DaytonaNotFoundError } = require('@daytonaio/sdk');
    mockDaytona.get.mockRejectedValueOnce(new DaytonaNotFoundError('not found'));

    await expect(service.resume('nonexistent')).rejects.toThrow();
    expect(mockDaytona.start).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Story 6.4: Verify Working Tree, Commit, and Credential Flows
// F4 — commit() failure-path tests (AC: #2): git add failure surfaces a
//        non-empty diagnostic (exit code) when stdout is empty; git commit
//        failure propagates the result message.
// F5 — listSkills() failure-path tests (AC: #4): executeCommand rejection
//        returns [] + logs warn; non-zero exitCode returns [] regardless of
//        stdout content (exitCode gate).
//
// Guard patterns + regex conventions follow the sibling
// `injectGitConfig()` failure-path test (lines 235-251) and the established
// `jest.spyOn(service['logger'], 'warn')` logger-spy convention from
// tool-pill-classifier.service.spec.ts / agui-event-bridge.service.spec.ts.
// ============================================================================

describe('[P0] Story 6.4 F4 — commit() failure-path tests (AC: #2)', () => {
  let mockDaytona: MockDaytona;
  let mockSandbox: MockSandbox;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona, mockSandbox } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('[P0] commit() throws a non-empty diagnostic (incl. exit code) when git add fails with empty result', async () => {
    mockSandbox.process.executeCommand
      .mockResolvedValueOnce({ exitCode: 1, result: '' }) // git add fails (stderr-only → empty stdout)
      .mockResolvedValueOnce({ exitCode: 0, result: '' }); // git commit — must NOT be reached

    await expect(service.commit('sandbox-1', 'msg')).rejects.toThrow(/exit code 1/);

    // git add failure short-circuits — git commit is never issued.
    expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(1);
  });

  it('[P0] commit() throws the git commit failure message when git commit fails', async () => {
    mockSandbox.process.executeCommand
      .mockResolvedValueOnce({ exitCode: 0, result: '' }) // git add succeeds
      .mockResolvedValueOnce({ exitCode: 1, result: 'nothing to commit, working tree clean' }); // git commit fails

    await expect(service.commit('sandbox-1', 'msg')).rejects.toThrow(
      'nothing to commit, working tree clean',
    );
  });
});

describe('[P0] Story 6.4 F5 — listSkills() failure-path tests (AC: #4)', () => {
  let mockDaytona: MockDaytona;
  let mockSandbox: MockSandbox;
  let service: SandboxService;

  beforeEach(() => {
    ({ mockDaytona, mockSandbox } = createMockDaytonaWithSandbox());
    service = new SandboxService(mockDaytona as unknown as Daytona);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('[P0] listSkills() returns [] and logs warn when executeCommand rejects', async () => {
    mockSandbox.process.executeCommand.mockRejectedValueOnce(new Error('ENOTREACHABLE'));
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    await expect(service.listSkills('sandbox-1')).resolves.toEqual([]);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('listSkills failed'));
  });

  it('[P0] listSkills() returns [] when ls fails with non-zero exitCode and empty result', async () => {
    mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 2, result: '' });

    await expect(service.listSkills('sandbox-1')).resolves.toEqual([]);
  });

  it('[P0] listSkills() returns [] when ls fails with non-zero exitCode and stdout output (exitCode gate)', async () => {
    mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 1, result: 'some junk' });

    await expect(service.listSkills('sandbox-1')).resolves.toEqual([]);
  });
});
