/**
 * @jest-environment node
 *
 * Story 6.2: Implement agui-event-bridge.service.ts
 * Unit tests for SandboxService process session lifecycle methods.
 *
 * Covers:
 *   AC-1 (createAgentSession — calls createSession + executeSessionCommand)
 *   AC-5 (terminateAgentSession — calls deleteSession, idempotent)
 *   AC-6 (streamAgentLogs — calls getSessionCommandLogs 4-arg callback overload)
 *
 * Regression guards (credential-isolation + input-injection) apply the uniform
 * guard template per user instruction. Sibling test file consulted:
 * sandbox.service.nfr-s1.spec.ts — established patterns:
 *   - expect(allCommands).not.toContain('DATABASE_URL') (absence assertion)
 *   - expect(cmd).not.toContain('conv-1') (user-controlled value absence)
 *   - expect(allCommands).not.toMatch(/pattern/) (regex convention)
 */
import type { Daytona } from '@daytonaio/sdk';
import { SandboxService } from './sandbox.service';
import {
  createMockDaytonaWithSandbox,
  type MockDaytona,
  type MockSandbox,
} from '../../test/helpers/mock-daytona';

describe('SandboxService session methods (Story 6.2)', () => {
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

  // ─── AC-1, AC-6: createAgentSession ─────────────────────────────────────

  describe('[P0] AC-1, AC-6 — createAgentSession', () => {
    it('[P0] calls createSession then executeSessionCommand with runAsync: true', async () => {
      await service.createAgentSession('sandbox-1', 'sandbox-agent --agent claude-code --prompt "hello"');

      expect(mockSandbox.process.createSession).toHaveBeenCalledTimes(1);
      expect(mockSandbox.process.executeSessionCommand).toHaveBeenCalledTimes(1);

      const [sessionId, req] = mockSandbox.process.executeSessionCommand.mock.calls[0];
      expect(sessionId).toEqual(expect.any(String));
      expect(req.runAsync).toBe(true);
      expect(req.command).toContain('sandbox-agent');
    });

    it('[P0] returns the session ID and command ID from executeSessionCommand', async () => {
      mockSandbox.process.executeSessionCommand.mockResolvedValueOnce({
        cmdId: 'cmd-42',
        exitCode: 0,
      });

      const handle = await service.createAgentSession('sandbox-1', 'sandbox-agent --prompt "test"');

      expect(handle.sessionId).toEqual(expect.any(String));
      expect(handle.commandId).toBe('cmd-42');
    });

    it('[P0] generates a unique session ID per call', async () => {
      const handle1 = await service.createAgentSession('sandbox-1', 'cmd1');
      const handle2 = await service.createAgentSession('sandbox-1', 'cmd2');

      expect(handle1.sessionId).not.toBe(handle2.sessionId);
    });

    it('[P0] prefixes the command with cwd when cwd is provided', async () => {
      // executeSessionCommand's SessionExecuteRequest has no cwd field (unlike
      // executeCommand which takes cwd as 2nd arg). If the agent must run in
      // REPO_SUBDIRECTORY, the command is prefixed: cd ${cwd} && ${command}.
      // The cwd is shell-quoted (project-context.md: "Shell-quote all
      // interpolated values in sandbox process commands") to prevent command
      // injection if cwd contains shell metacharacters.
      await service.createAgentSession('sandbox-1', 'sandbox-agent --prompt "test"', 'repo');

      const req = mockSandbox.process.executeSessionCommand.mock.calls[0][1];
      expect(req.command).toContain("cd 'repo'");
      expect(req.command).toContain('sandbox-agent');
    });

    it('[P0] does NOT prefix the command when cwd is not provided', async () => {
      await service.createAgentSession('sandbox-1', 'sandbox-agent --prompt "test"');

      const req = mockSandbox.process.executeSessionCommand.mock.calls[0][1];
      expect(req.command).toBe('sandbox-agent --prompt "test"');
    });
  });

  // ─── AC-6: streamAgentLogs ──────────────────────────────────────────────

  describe('[P0] AC-6 — streamAgentLogs', () => {
    it('[P0] calls getSessionCommandLogs with the 4-arg callback overload', async () => {
      const handle = { sessionId: 'sess-1', commandId: 'cmd-1' };
      const onStdout = jest.fn();
      const onStderr = jest.fn();

      await service.streamAgentLogs('sandbox-1', handle, onStdout, onStderr);

      expect(mockSandbox.process.getSessionCommandLogs).toHaveBeenCalledTimes(1);
      const callArgs = mockSandbox.process.getSessionCommandLogs.mock.calls[0];
      expect(callArgs[0]).toBe('sess-1'); // sessionId
      expect(callArgs[1]).toBe('cmd-1'); // commandId
      expect(typeof callArgs[2]).toBe('function'); // onStdout
      expect(typeof callArgs[3]).toBe('function'); // onStderr
    });

    it('[P0] invokes onStdout callback with chunks from getSessionCommandLogs', async () => {
      const handle = { sessionId: 'sess-1', commandId: 'cmd-1' };
      const onStdout = jest.fn();
      const onStderr = jest.fn();

      // Configure the mock to invoke onStdout with test chunks
      mockSandbox.process.getSessionCommandLogs.mockImplementationOnce(
        async (_sid: string, _cid: string, stdoutCb: (chunk: string) => void, _stderrCb: (chunk: string) => void) => {
          stdoutCb('chunk-1\n');
          stdoutCb('chunk-2\n');
        },
      );

      await service.streamAgentLogs('sandbox-1', handle, onStdout, onStderr);

      expect(onStdout).toHaveBeenCalledWith('chunk-1\n');
      expect(onStdout).toHaveBeenCalledWith('chunk-2\n');
    });

    it('[P0] invokes onStderr callback with stderr chunks', async () => {
      const handle = { sessionId: 'sess-1', commandId: 'cmd-1' };
      const onStdout = jest.fn();
      const onStderr = jest.fn();

      mockSandbox.process.getSessionCommandLogs.mockImplementationOnce(
        async (_sid: string, _cid: string, _stdoutCb: (chunk: string) => void, stderrCb: (chunk: string) => void) => {
          stderrCb('warning: something\n');
        },
      );

      await service.streamAgentLogs('sandbox-1', handle, onStdout, onStderr);

      expect(onStderr).toHaveBeenCalledWith('warning: something\n');
    });

    it('[P0] resolves when getSessionCommandLogs resolves (stream completes)', async () => {
      const handle = { sessionId: 'sess-1', commandId: 'cmd-1' };

      await expect(
        service.streamAgentLogs('sandbox-1', handle, jest.fn(), jest.fn()),
      ).resolves.toBeUndefined();
    });
  });

  // ─── AC-5: terminateAgentSession ────────────────────────────────────────

  describe('[P0] AC-5 — terminateAgentSession', () => {
    it('[P0] calls deleteSession with the session ID', async () => {
      await service.terminateAgentSession('sandbox-1', 'sess-1');

      expect(mockSandbox.process.deleteSession).toHaveBeenCalledTimes(1);
      expect(mockSandbox.process.deleteSession).toHaveBeenCalledWith('sess-1');
    });

    it('[P0] returns void on success', async () => {
      await expect(service.terminateAgentSession('sandbox-1', 'sess-1')).resolves.toBeUndefined();
    });

    it('[P0] is idempotent — returns void when session is already deleted (DaytonaNotFoundError)', async () => {
      // F1 pattern from Story 6.1: deleteSession on an already-deleted session
      // should not throw. Catch DaytonaNotFoundError and return void.
      const { DaytonaNotFoundError } = require('@daytonaio/sdk');
      mockSandbox.process.deleteSession.mockRejectedValueOnce(
        new DaytonaNotFoundError('Session not found'),
      );

      await expect(service.terminateAgentSession('sandbox-1', 'sess-1')).resolves.toBeUndefined();
    });

    it('[P0] re-throws non-404 errors (e.g. DaytonaAuthorizationError 403)', async () => {
      const { DaytonaAuthorizationError } = require('@daytonaio/sdk');
      mockSandbox.process.deleteSession.mockRejectedValueOnce(
        new DaytonaAuthorizationError('Forbidden'),
      );

      await expect(service.terminateAgentSession('sandbox-1', 'sess-1')).rejects.toThrow('Forbidden');
    });
  });

  // ─── AC-5, AC-6: Error propagation ──────────────────────────────────────

  describe('[P0] AC-5, AC-6 — Error propagation', () => {
    it('[P0] createAgentSession propagates error when createSession rejects', async () => {
      mockSandbox.process.createSession.mockRejectedValueOnce(new Error('createSession failed'));

      await expect(
        service.createAgentSession('sandbox-1', 'sandbox-agent --prompt "test"'),
      ).rejects.toThrow('createSession failed');
    });

    it('[P0] createAgentSession propagates error when executeSessionCommand rejects', async () => {
      mockSandbox.process.executeSessionCommand.mockRejectedValueOnce(
        new Error('executeSessionCommand failed'),
      );

      await expect(
        service.createAgentSession('sandbox-1', 'sandbox-agent --prompt "test"'),
      ).rejects.toThrow('executeSessionCommand failed');
    });

    it('[P0] streamAgentLogs propagates error when getSessionCommandLogs rejects', async () => {
      mockSandbox.process.getSessionCommandLogs.mockRejectedValueOnce(
        new Error('getSessionCommandLogs failed'),
      );

      const handle = { sessionId: 'sess-1', commandId: 'cmd-1' };
      await expect(
        service.streamAgentLogs('sandbox-1', handle, jest.fn(), jest.fn()),
      ).rejects.toThrow('getSessionCommandLogs failed');
    });
  });

  // ─── Regression Guards: Credential-Isolation + Input-Injection ─────────
  //
  // Per user instruction: "When creating regression guards for code that
  // executes external commands with user-controlled input, apply a uniform
  // guard template to every call site: exercise both credential-isolation
  // invariants (no credentials leak via command arguments or environment
  // variables) and input-injection invariants (malicious input is safely
  // quoted and cannot alter the command's behavior)."
  //
  // Sibling test file consulted: sandbox.service.nfr-s1.spec.ts
  // Established patterns applied:
  //   - expect(allCommands).not.toContain('DATABASE_URL') (absence assertion)
  //   - expect(cmd).not.toContain('conv-1') (user-controlled value absence)
  //   - expect(allCommands).not.toMatch(/pattern/) (regex convention)
  //
  // The createAgentSession method calls executeSessionCommand(sessionId,
  // { command, runAsync: true }). The `command` parameter is the sandbox-agent
  // invocation string, which may contain user-controlled input (the prompt).
  // SandboxService passes the command through verbatim — it does NOT construct
  // or shell-quote the command (that's the caller's responsibility in Story 6.3).
  // These guards verify SandboxService does not introduce credential leakage
  // or command modification at the SDK boundary.

  describe('[P0] Regression guards — credential-isolation + input-injection for createAgentSession', () => {
    it('[P0] command passed to executeSessionCommand does NOT contain platform credentials', async () => {
      await service.createAgentSession('sandbox-1', 'sandbox-agent --prompt "test"');

      const req = mockSandbox.process.executeSessionCommand.mock.calls[0][1];
      const command = req.command;
      expect(command).not.toContain('DATABASE_URL');
      expect(command).not.toContain('AUTH_SECRET');
      expect(command).not.toContain('DAYTONA_API_KEY');
      expect(command).not.toContain('DAYTONA_API_URL');
      expect(command).not.toContain('CREDENTIAL_ENCRYPTION_KEK');
    });

    it('[P0] ANTHROPIC_API_KEY and GITHUB_TOKEN are NOT interpolated into the command (injected via sandbox env only)', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      try {
        await service.createAgentSession('sandbox-1', 'sandbox-agent --prompt "test"');
      } finally {
        delete process.env.ANTHROPIC_API_KEY;
      }

      const req = mockSandbox.process.executeSessionCommand.mock.calls[0][1];
      const command = req.command;
      expect(command).not.toContain('sk-ant-test-key');
      expect(command).not.toContain('ANTHROPIC_API_KEY');
      expect(command).not.toContain('GITHUB_TOKEN');
    });

    it('[P0] SessionExecuteRequest does NOT carry an env field (credentials go through daytona.create envVars, not session commands)', async () => {
      await service.createAgentSession('sandbox-1', 'sandbox-agent --prompt "test"');

      const req = mockSandbox.process.executeSessionCommand.mock.calls[0][1];
      // SessionExecuteRequest shape: { command, runAsync, suppressInputEcho?, async? }
      // There is NO env field — credentials cannot leak through session command env.
      expect(req).not.toHaveProperty('env');
      expect(req).not.toHaveProperty('envVars');
    });

    it('[P0] command is passed through verbatim — SandboxService does NOT modify the command', async () => {
      const originalCommand = 'sandbox-agent --agent claude-code --prompt "hello world"';
      await service.createAgentSession('sandbox-1', originalCommand);

      const req = mockSandbox.process.executeSessionCommand.mock.calls[0][1];
      // When no cwd is provided, the command should be passed through unchanged.
      expect(req.command).toBe(originalCommand);
    });

    it('[P0] malicious input in the command cannot inject additional shell commands (command passed as single string to SDK)', async () => {
      // The command contains a malicious prompt with shell metacharacters.
      // SandboxService passes it to executeSessionCommand as-is. The SDK's
      // executeSessionCommand runs the command in a shell — the CALLER
      // (Story 6.3 AgentService) is responsible for shell-quoting user input
      // within the command string. This guard verifies SandboxService does
      // not strip or modify quoting that the caller applied.
      const maliciousCommand = 'sandbox-agent --prompt \'hello"; rm -rf / #"\'';
      await service.createAgentSession('sandbox-1', maliciousCommand);

      const req = mockSandbox.process.executeSessionCommand.mock.calls[0][1];
      expect(req.command).toBe(maliciousCommand);
    });

    it('[P0] session ID does NOT contain platform credentials or user-controlled values', async () => {
      await service.createAgentSession('sandbox-1', 'sandbox-agent --prompt "test"');

      const sessionId = mockSandbox.process.createSession.mock.calls[0][0];
      expect(sessionId).not.toContain('DATABASE_URL');
      expect(sessionId).not.toContain('AUTH_SECRET');
      expect(sessionId).not.toContain('DAYTONA_API_KEY');
      expect(sessionId).not.toContain('ANTHROPIC_API_KEY');
      expect(sessionId).not.toContain('GITHUB_TOKEN');
      // Session ID should be generated (e.g. agent-${conversationId}-${timestamp}),
      // not derived from user input that could be malicious.
      expect(sessionId).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });
});
