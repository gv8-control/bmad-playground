/**
 * @jest-environment node
 *
 * Story 3.8: Track Per-User LLM Spend
 * Story 3.10: Verify Commits Carry the User's Own Identity
 * Story 3.12: Drain Conversations Gracefully on Deploy
 * Post-3.12 fix: clone() and getWorkingTreeStatus() exitCode checks
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
 *
 * NFR-S1 Task 6.4 regression guard: ANTHROPIC_API_KEY is passed to the in-process
 * Claude Agent SDK via AgentService.runTurn()'s query() env option — it runs inside
 * the NestJS container, NOT inside the Daytona Sandbox. The Sandbox only receives
 * executeCommand calls (git operations). The provision() test below guards that
 * daytona.create() never receives env vars, which covers this concern at the
 * Sandbox boundary.
 *
 * TDD GREEN PHASE — all tests un-skipped and passing.
 * Existing code satisfies NFR-S1 — these tests PASS immediately.
 */
import type { Daytona } from '@daytonaio/sdk';
import { SandboxService } from './sandbox.service';

/**
 * Mock shapes mirroring the @daytonaio/sdk contract.
 * ExecuteResult mirrors ExecuteResponse (not exported from SDK root — see
 * node_modules/@daytonaio/sdk/cjs/types/ExecuteResponse.d.ts).
 * If the SDK changes executeCommand's signature, these types flag it at compile time.
 */
type ExecuteResult = { exitCode: number; result: string; artifacts?: { stdout: string } };

type MockSandbox = {
  id: string;
  process: {
    executeCommand: jest.Mock<Promise<ExecuteResult>, [string, string?, Record<string, string>?, number?]>;
    killPtySession: jest.Mock<Promise<void>, [string]>;
  };
  labels?: Record<string, string>;
};

type MockDaytona = {
  create: jest.Mock<Promise<MockSandbox>>;
  get: jest.Mock<Promise<MockSandbox>, [string]>;
  delete: jest.Mock<Promise<void>, [MockSandbox]>;
  start: jest.Mock<Promise<void>, [MockSandbox]>;
};

describe('SandboxService NFR-S1 — credential isolation regression guards (Story 3.8 AC-3)', () => {
  let mockDaytona: MockDaytona;
  let mockSandbox: MockSandbox;
  let service: SandboxService;

  beforeEach(() => {
    mockSandbox = {
      id: 'sandbox-1',
      process: {
        executeCommand: jest.fn().mockResolvedValue({ exitCode: 0, result: '' }),
        killPtySession: jest.fn().mockResolvedValue(undefined),
      },
    };

    mockDaytona = {
      create: jest.fn().mockResolvedValue(mockSandbox),
      get: jest.fn().mockResolvedValue(mockSandbox),
      delete: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
    };

    service = new SandboxService(mockDaytona as unknown as Daytona);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('[P0] provision() — only labels passed to daytona.create()', () => {
    it('calls daytona.create() with only labels — no env, no resources, no metadata', async () => {
      await service.provision({
        conversationId: 'conv-1',
        repoUrl: 'https://github.com/test/repo.git',
        credential: 'fake-token',
      });

      expect(mockDaytona.create).toHaveBeenCalledTimes(1);
      const createArg = mockDaytona.create.mock.calls[0][0];
      expect(createArg).toHaveProperty('labels');
      expect(createArg).not.toHaveProperty('env');
      expect(createArg).not.toHaveProperty('resources');
      expect(createArg).not.toHaveProperty('metadata');
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
  });

  describe('[P0] clone() — OAuth token injected into git URL only', () => {
    it('injects OAuth token into git URL via x-access-token username (not as env var or separate arg)', async () => {
      await service.clone(
        'sandbox-1',
        'https://github.com/test/repo.git',
        'fake-oauth-token',
      );

      expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(1);
      const command = mockSandbox.process.executeCommand.mock.calls[0][0] as string;
      expect(command).toContain('x-access-token');
      expect(command).toContain('fake-oauth-token');
      expect(command).toContain('git clone');
    });

    it('credential is NOT passed as an env var or separate argument to executeCommand', async () => {
      await service.clone(
        'sandbox-1',
        'https://github.com/test/repo.git',
        'fake-oauth-token',
      );

      const callArgs = mockSandbox.process.executeCommand.mock.calls[0];
      expect(callArgs).toHaveLength(4);
      const envArg = callArgs[2];
      expect(envArg).toBeUndefined();
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
        (c: unknown[]) => c[0] as string,
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
        (c: unknown[]) => c[0] as string,
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
        (c: unknown[]) => c[0] as string,
      );
      const commitCommand = commands.find((cmd: string) => cmd.includes('git commit'));
      expect(commitCommand).toBeDefined();
      expect(commitCommand).not.toContain('--author');
    });

    it('[P0] commit() command does not interpolate a platform service account', async () => {
      await service.commit('sandbox-1', 'msg');

      const commands = mockSandbox.process.executeCommand.mock.calls.map(
        (c: unknown[]) => c[0] as string,
      );
      const allCommands = commands.join(' ');
      expect(allCommands).not.toMatch(/--author=|bmad-easy|platform@/);
    });

    it('[P0] injectGitConfig() sets BOTH user.name and user.email', async () => {
      await service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' });

      const commands = mockSandbox.process.executeCommand.mock.calls.map(
        (c: unknown[]) => c[0] as string,
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
  });

  describe('[P0] clone() — throws on non-zero exitCode (error propagation guard)', () => {
    it('[P0] clone() throws with the command output when git clone fails', async () => {
      mockSandbox.process.executeCommand.mockResolvedValueOnce({
        exitCode: 128,
        result: 'fatal: repository not found',
      });

      await expect(
        service.clone('sandbox-1', 'https://github.com/test/repo.git', 'fake-token'),
      ).rejects.toThrow('fatal: repository not found');
    });

    it('[P0] clone() does not throw when exitCode is 0', async () => {
      mockSandbox.process.executeCommand.mockResolvedValueOnce({ exitCode: 0, result: '' });

      await expect(
        service.clone('sandbox-1', 'https://github.com/test/repo.git', 'fake-token'),
      ).resolves.toBeUndefined();
    });

    it('[P0] clone() redacts the OAuth token from the thrown error message', async () => {
      const token = 'ghp_SECRET_TOKEN_12345';
      mockSandbox.process.executeCommand.mockResolvedValueOnce({
        exitCode: 128,
        result: `fatal: Authentication failed for 'https://x-access-token:${token}@github.com/test/repo.git/'`,
      });

      let captured: Error | undefined;
      try {
        await service.clone('sandbox-1', 'https://github.com/test/repo.git', token);
      } catch (err) {
        captured = err as Error;
      }

      expect(captured).toBeDefined();
      expect(captured?.message).not.toContain(token);
      expect(captured?.message).toContain('[REDACTED]');
      expect(captured?.message).toContain('Authentication failed');
    });

    it('[P0] clone() throws with "destination path" message when working directory is not empty (Gap C)', async () => {
      mockSandbox.process.executeCommand.mockResolvedValueOnce({
        exitCode: 128,
        result: "fatal: destination path '.' already exists and is not an empty directory.",
      });

      await expect(
        service.clone('sandbox-1', 'https://github.com/test/repo.git', 'fake-token'),
      ).rejects.toThrow("fatal: destination path '.' already exists and is not an empty directory.");
    });

    it('[P1] clone() targets the repo subdirectory, not the sandbox working directory', async () => {
      await service.clone('sandbox-1', 'https://github.com/test/repo.git', 'fake-token');

      expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(1);
      const [command] = mockSandbox.process.executeCommand.mock.calls[0];
      expect(command).toContain('git clone --depth=1');
      expect(command).toContain('repo');
      // Must NOT clone into '.' — that was the production bug.
      expect(command).not.toMatch(/\s\.\s*$/);
    });
  });

  describe('[P0] getWorkingTreeStatus() — throws on non-zero exitCode (error propagation guard)', () => {
    it('[P0] getWorkingTreeStatus() throws with the command output when git status fails', async () => {
      mockSandbox.process.executeCommand.mockResolvedValueOnce({
        exitCode: 128,
        result: 'fatal: not a git directory',
      });

      await expect(
        service.getWorkingTreeStatus('sandbox-1'),
      ).rejects.toThrow('fatal: not a git directory');
    });

    it('[P0] getWorkingTreeStatus() does not throw when exitCode is 0', async () => {
      mockSandbox.process.executeCommand.mockResolvedValueOnce({ exitCode: 0, result: '' });

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

  describe('[P1] cwd argument — all git commands pass explicit repo subdirectory (Gap C)', () => {
    it('[P1] injectGitConfig() passes "repo" as cwd, not undefined', async () => {
      await service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' });

      expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(2);
      for (const call of mockSandbox.process.executeCommand.mock.calls) {
        expect(call[1]).toBe('repo');
      }
    });

    it('[P1] getWorkingTreeStatus() passes "repo" as cwd, not undefined', async () => {
      await service.getWorkingTreeStatus('sandbox-1');

      expect(mockSandbox.process.executeCommand).toHaveBeenCalledTimes(1);
      const cwd = mockSandbox.process.executeCommand.mock.calls[0][1];
      expect(cwd).toBe('repo');
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
