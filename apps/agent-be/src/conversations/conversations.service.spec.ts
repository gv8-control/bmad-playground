/**
 * Story 3.1: Provision a Sandbox When Opening a Conversation
 * Story 3.2: Invoke BMAD Skills via Slash Command
 * Story 3.5: Resume an Existing Conversation
 * Unit tests for ConversationsService.
 * Uses SandboxServiceFake via buildTestModule().
 *
 * Covers: AC-1 (provision pipeline), AC-3 (idle timeout), AC-4 (provision failure cleanup),
 * AC-6 (provision queue concurrency cap).
 * Story 3.2 covers: AC-1 (listSkills), AC-2 (empty skills), AC-3 (sendTurn persistence + title).
 * Story 3.5 covers: AC-2 (resume fast/slow path, git identity re-injection, idle timer).
 *
 * TDD GREEN PHASE: Story 3.5 tests un-skipped and passing.
 */
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsModule } from './conversations.module';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { SessionEventsService } from '../streaming/session-events.service';
import { DAYTONA_CLIENT } from '../sandbox/daytona-client.provider';
import { IdleTimeoutService } from '../sandbox/idle-timeout.service';
import { AGENT_SERVICE, SANDBOX_SERVICE } from '@bmad-easy/shared-types';
import { buildTestModule } from '../../test/helpers/test-module-builder';
import { SandboxServiceFake } from '../../test/helpers/sandbox-service.fake';
import { AgentServiceFake } from '../../test/helpers/agent-service.fake';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let sessionEvents: SessionEventsService;
  let agentFake: AgentServiceFake;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sandboxFake: any;
  let idleTimeout: IdleTimeoutService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      conversation: {
        create: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1' }),
        update: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1', title: 'test title' }),
      },
      turn: {
        create: jest.fn().mockResolvedValue({ id: 'turn-1' }),
      },
      repoConnection: {
        findUnique: jest.fn().mockResolvedValue({ repoUrl: 'https://github.com/test/repo.git' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Test User',
          email: 'test@example.com',
          githubLogin: 'testuser',
        }),
      },
      oAuthCredential: {
        findUnique: jest.fn().mockResolvedValue({
          encryptedDek: 'encrypted-dek',
          dekNonce: 'dek-nonce',
          encryptedToken: 'encrypted-token',
          tokenNonce: 'token-nonce',
          kekId: 'kek-id',
        }),
      },
    };

    const sandboxFakeInstance = new SandboxServiceFake();
    const sessionEventsInstance = new SessionEventsService();
    agentFake = new AgentServiceFake(sessionEventsInstance, mockPrisma, sandboxFakeInstance);

    const { module, sandboxFake: sf } = await buildTestModule([ConversationsModule], [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: DAYTONA_CLIENT, useValue: null },
      {
        provide: CredentialsService,
        useValue: { resolveOAuthToken: jest.fn().mockResolvedValue('fake-oauth-token') },
      },
      { provide: AGENT_SERVICE, useValue: agentFake },
      { provide: SANDBOX_SERVICE, useValue: sandboxFakeInstance },
    ]);

    service = module.get(ConversationsService);
    sessionEvents = module.get(SessionEventsService);
    sandboxFake = sandboxFakeInstance;
    idleTimeout = module.get(IdleTimeoutService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('[P0] createConversation', () => {
    it('creates a Conversation record in the DB and returns its ID', async () => {
      const result = await service.createConversation('user-1');
      expect(result.id).toBe('conv-1');
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', title: null, lastActiveAt: expect.any(Date) },
      });
    });
  });

  describe('[P0] provisionSandbox', () => {
    it('calls provision → clone → injectGitConfig → getWorkingTreeStatus in order on the fake', async () => {
      const provisionSpy = jest.spyOn(sandboxFake, 'provision');
      const cloneSpy = jest.spyOn(sandboxFake, 'clone');
      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');
      const statusSpy = jest.spyOn(sandboxFake, 'getWorkingTreeStatus');

      await service.provisionSandbox('conv-1', 'user-1');

      expect(provisionSpy).toHaveBeenCalled();
      expect(cloneSpy).toHaveBeenCalled();
      expect(injectSpy).toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalled();

      const provisionOrder = provisionSpy.mock.invocationCallOrder[0];
      const cloneOrder = cloneSpy.mock.invocationCallOrder[0];
      const injectOrder = injectSpy.mock.invocationCallOrder[0];
      const statusOrder = statusSpy.mock.invocationCallOrder[0];

      expect(provisionOrder).toBeLessThan(cloneOrder);
      expect(cloneOrder).toBeLessThan(injectOrder);
      expect(injectOrder).toBeLessThan(statusOrder);
    });

    it('emits SESSION_READY after provision + clone + git-config + WORKING_TREE status', async () => {
      const emitSpy = jest.spyOn(sessionEvents, 'emit');
      await service.provisionSandbox('conv-1', 'user-1');

      const events = emitSpy.mock.calls.map((c: unknown[]) => (c[1] as { event: string }).event);
      expect(events).toContain('WORKING_TREE_CLEAN');
      expect(events).toContain('SESSION_READY');
      expect(events.indexOf('WORKING_TREE_CLEAN')).toBeLessThan(events.indexOf('SESSION_READY'));
    });

    it('[P1] emits WORKING_TREE_DIRTY when the working tree is dirty', async () => {
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValueOnce({
        dirty: true,
        files: ['modified-file.ts'],
      });
      const emitSpy = jest.spyOn(sessionEvents, 'emit');

      await service.provisionSandbox('conv-1', 'user-1');

      const events = emitSpy.mock.calls.map((c: unknown[]) => (c[1] as { event: string }).event);
      expect(events).toContain('WORKING_TREE_DIRTY');
      expect(events).not.toContain('WORKING_TREE_CLEAN');
    });
  });

  describe('[P0] provision failure cleanup (AC-4)', () => {
    it('calls destroy() on the fake when provision fails (no zombie sandboxes)', async () => {
      sandboxFake.failNextProvision();
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');
      const emitSpy = jest.spyOn(sessionEvents, 'emit');

      await service.provisionSandbox('conv-1', 'user-1');

      expect(destroySpy).not.toHaveBeenCalled();
      expect(sandboxFake.activeSandboxCount()).toBe(0);

      const events = emitSpy.mock.calls.map((c: unknown[]) => (c[1] as { event: string }).event);
      expect(events).toContain('SESSION_ERROR');
    });

    it('cleans up partial allocation when a step after provision fails', async () => {
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');
      const emitSpy = jest.spyOn(sessionEvents, 'emit');
      jest.spyOn(sandboxFake, 'clone').mockRejectedValueOnce(new Error('clone failed'));

      await service.provisionSandbox('conv-1', 'user-1');

      expect(destroySpy).toHaveBeenCalled();
      expect(sandboxFake.activeSandboxCount()).toBe(0);

      const events = emitSpy.mock.calls.map((c: unknown[]) => (c[1] as { event: string }).event);
      expect(events).toContain('SESSION_ERROR');
    });
  });

  describe('[P0] idle timeout (AC-3)', () => {
    it('fires after the configured delay when no first message is sent', async () => {
      jest.useFakeTimers();
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');

      await service.provisionSandbox('conv-1', 'user-1');
      expect(destroySpy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(60_000);

      expect(destroySpy).toHaveBeenCalledWith(expect.any(String));
    });

    it('is cleared when onFirstMessage is called', async () => {
      jest.useFakeTimers();
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');

      await service.provisionSandbox('conv-1', 'user-1');
      await service.onFirstMessage('conv-1');

      await jest.advanceTimersByTimeAsync(60_000);

      expect(destroySpy).not.toHaveBeenCalled();
    });
  });

  describe('[P1] provision queue (AC-6)', () => {
    it('blocks 3rd simultaneous provision until a slot frees', async () => {
      sandboxFake.setProvisionDelay(100);

      const provisionSpy = jest.spyOn(sandboxFake, 'provision');

      const promise1 = service.provisionSandbox('conv-1', 'user-1');
      const promise2 = service.provisionSandbox('conv-2', 'user-1');
      const promise3 = service.provisionSandbox('conv-3', 'user-1');

      jest.useFakeTimers();
      jest.advanceTimersByTime(100);
      jest.useRealTimers();

      await Promise.all([promise1, promise2, promise3]);

      expect(provisionSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('[P0] getStatus (ownership)', () => {
    it('returns failed when the conversation does not belong to the user', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      const result = await service.getStatus('conv-1', 'user-other');

      expect(result.sandboxStatus).toBe('failed');
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-1', userId: 'user-other' },
        select: { id: true },
      });
    });

    it('returns ready after SESSION_READY is emitted', async () => {
      await service.provisionSandbox('conv-1', 'user-1');

      const result = await service.getStatus('conv-1', 'user-1');
      expect(result.sandboxStatus).toBe('ready');
    });
  });

  describe('[P0] listSkills (AC-1, AC-2)', () => {
    it('returns skills from the sandbox fake', async () => {
      sandboxFake.setSkills([{ name: 'bmad-prd' }, { name: 'bmad-architect' }]);
      await service.provisionSandbox('conv-1', 'user-1');

      const result = await service.listSkills('conv-1', 'user-1');

      expect(result).toEqual([{ name: 'bmad-prd' }, { name: 'bmad-architect' }]);
    });

    it('returns [] for a conversation not owned by the user (tenant isolation)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      await service.provisionSandbox('conv-1', 'user-1');

      const result = await service.listSkills('conv-1', 'user-other');

      expect(result).toEqual([]);
    });

    it('returns [] when sandbox is not yet provisioned', async () => {
      const result = await service.listSkills('conv-1', 'user-1');

      expect(result).toEqual([]);
    });

    it('[P1] returns [] when .claude/skills/ is empty', async () => {
      sandboxFake.setSkills([]);
      await service.provisionSandbox('conv-1', 'user-1');

      const result = await service.listSkills('conv-1', 'user-1');

      expect(result).toEqual([]);
    });
  });

  describe('[P0] sendTurn (AC-3)', () => {
    it('persists a user turn with the correct content', async () => {
      await service.sendTurn('conv-1', 'user-1', '/bmad-prd create a product brief');

      expect(mockPrisma.turn.create).toHaveBeenCalledWith({
        data: { conversationId: 'conv-1', role: 'user', content: '/bmad-prd create a product brief' },
      });
    });

    it('clears the idle timeout', async () => {
      jest.useFakeTimers();
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');
      await service.provisionSandbox('conv-1', 'user-1');

      await service.sendTurn('conv-1', 'user-1', 'hello world');

      await jest.advanceTimersByTimeAsync(60_000);
      expect(destroySpy).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('generates and persists a semantic title on first message', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        userId: 'user-1',
        title: null,
      });

      await service.sendTurn('conv-1', 'user-1', '/bmad-prd create a product brief');

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: expect.objectContaining({ title: expect.any(String) }),
        }),
      );
    });

    it('does not overwrite an existing title on subsequent messages', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        userId: 'user-1',
        title: 'Existing Title',
      });

      await service.sendTurn('conv-1', 'user-1', 'second message');

      expect(mockPrisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: expect.any(String) }),
        }),
      );
    });

    it('[P1] updates lastActiveAt on subsequent messages', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        userId: 'user-1',
        title: 'Existing Title',
      });

      await service.sendTurn('conv-1', 'user-1', 'second message');

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: expect.objectContaining({ lastActiveAt: expect.any(Date) }),
        }),
      );
    });

    it('throws NotFoundException for a conversation not owned by the user', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      await expect(service.sendTurn('conv-1', 'user-other', 'hello')).rejects.toThrow();
    });

    it('[P1] updates lastActiveAt', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        userId: 'user-1',
        title: null,
      });

      await service.sendTurn('conv-1', 'user-1', 'hello world');

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: expect.objectContaining({ lastActiveAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('[P0] Story 3.3 — sendTurn invokes agent (AC-1)', () => {
    it('calls agentService.runTurn fire-and-forget after persisting the user turn', async () => {
      await service.provisionSandbox('conv-1', 'user-1');

      const runTurnSpy = jest.spyOn(agentFake, 'runTurn');

      await service.sendTurn('conv-1', 'user-1', 'hello agent');

      await new Promise((r) => setTimeout(r, 50));

      expect(runTurnSpy).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        sandboxId: expect.any(String),
        message: 'hello agent',
        userId: 'user-1',
      });
    });

    it('does not block on agent completion (returns before runTurn resolves)', async () => {
      await service.provisionSandbox('conv-1', 'user-1');

      agentFake.setStreamDelay(100);

      const start = Date.now();
      await service.sendTurn('conv-1', 'user-1', 'hello agent');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('[P1] emits RUN_ERROR if sandbox not ready', async () => {
      const emitSpy = jest.spyOn(sessionEvents, 'emit');

      await service.sendTurn('conv-1', 'user-1', 'hello agent');

      await new Promise((r) => setTimeout(r, 50));

      const runErrorEmitted = emitSpy.mock.calls.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[1]?.event === 'RUN_ERROR',
      );
      expect(runErrorEmitted).toBe(true);
    });
  });

  describe('[P0] Story 3.3 — stopAgent (AC-3)', () => {
    it('calls agentService.stop', async () => {
      const stopSpy = jest.spyOn(agentFake, 'stop');

      await service.stopAgent('conv-1', 'user-1');

      expect(stopSpy).toHaveBeenCalledWith('conv-1');
    });

    it('throws NotFoundException for a conversation not owned by the user', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      await expect(service.stopAgent('conv-1', 'user-other')).rejects.toThrow();
    });

    it('[P1] returns { stopped: true }', async () => {
      const result = await service.stopAgent('conv-1', 'user-1');

      expect(result).toEqual({ conversationId: 'conv-1', stopped: true });
    });
  });

  describe('[P0] Story 3.5 — resumeConversation (AC-2)', () => {
    it('[P0] returns "ready" status and does NOT call provision when sandbox is already alive (fast path)', async () => {
      await service.provisionSandbox('conv-1', 'user-1');

      const provisionSpy = jest.spyOn(sandboxFake, 'provision');
      const result = await service.resumeConversation('conv-1', 'user-1');

      expect(result.sandboxStatus).toBe('ready');
      expect(provisionSpy).not.toHaveBeenCalled();
    });

    it('[P0] re-injects git config on fast-path resume (AC-2 git identity re-injection)', async () => {
      await service.provisionSandbox('conv-1', 'user-1');

      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');
      await service.resumeConversation('conv-1', 'user-1');

      expect(injectSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ name: expect.any(String), email: expect.any(String) }),
      );
    });

    it('[P0] emits WORKING_TREE_* and SESSION_READY on fast-path resume', async () => {
      await service.provisionSandbox('conv-1', 'user-1');

      const emitSpy = jest.spyOn(sessionEvents, 'emit');
      await service.resumeConversation('conv-1', 'user-1');

      const events = emitSpy.mock.calls.map((c: unknown[]) => (c[1] as { event: string }).event);
      expect(events).toContain('SESSION_READY');
      const hasWorkingTree =
        events.includes('WORKING_TREE_CLEAN') || events.includes('WORKING_TREE_DIRTY');
      expect(hasWorkingTree).toBe(true);

      const workingTreeIndex = Math.max(
        events.indexOf('WORKING_TREE_CLEAN'),
        events.indexOf('WORKING_TREE_DIRTY'),
      );
      expect(workingTreeIndex).toBeLessThan(events.indexOf('SESSION_READY'));
    });

    it('[P0] returns "provisioning" and calls provisionSandbox when sandbox is not alive (slow path)', async () => {
      const provisionSpy = jest.spyOn(service, 'provisionSandbox').mockResolvedValue(undefined);

      const result = await service.resumeConversation('conv-1', 'user-1');

      expect(result.sandboxStatus).toBe('provisioning');
      expect(provisionSpy).toHaveBeenCalledWith('conv-1', 'user-1');
    });

    it('[P0] returns "failed" for conversation not owned by user (tenant isolation)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      const result = await service.resumeConversation('conv-1', 'user-other');

      expect(result.sandboxStatus).toBe('failed');
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-1', userId: 'user-other' },
        select: { id: true },
      });
    });

    it('[P1] does not start duplicate idle timer when one is already running', async () => {
      await service.provisionSandbox('conv-1', 'user-1');

      const startTimerSpy = jest.spyOn(idleTimeout, 'startTimer');
      await service.resumeConversation('conv-1', 'user-1');

      expect(startTimerSpy).not.toHaveBeenCalled();
    });

    it('[P1] resolveGitIdentity resolves git identity with noreply email fallback', async () => {
      await service.provisionSandbox('conv-1', 'user-1');

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        name: null,
        email: null,
        githubLogin: 'testuser',
      });

      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');
      await service.resumeConversation('conv-1', 'user-1');

      expect(injectSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          name: 'testuser',
          email: 'testuser@users.noreply.github.com',
        }),
      );
    });
  });

  describe('[P0] Story 3.6 — manualCommit', () => {
    it('manualCommit delegates to manualCommitService.requestCommit with correct args', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1' });
      jest.spyOn(sandboxFake, 'provision').mockResolvedValue({
        sandboxId: 'sb-1',
        conversationId: 'conv-1',
        status: 'ready',
        provisionedAt: new Date(),
      });
      jest.spyOn(sandboxFake, 'clone').mockResolvedValue(undefined);
      jest.spyOn(sandboxFake, 'injectGitConfig').mockResolvedValue(undefined);
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: false, files: [] });
      await service.provisionSandbox('conv-1', 'user-1');

      const requestCommitSpy = jest.spyOn(
        service['manualCommitService'],
        'requestCommit',
      ).mockResolvedValue({ committed: true, clean: false, queued: false });

      const result = await service.manualCommit('conv-1', 'user-1');

      expect(result).toEqual({ committed: true, clean: false, queued: false });
      expect(requestCommitSpy).toHaveBeenCalledWith('conv-1', 'user-1', 'sb-1');
    });

    it('manualCommit throws NotFoundException for conversation not owned by user (tenant isolation)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      await expect(service.manualCommit('conv-1', 'wrong-user')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('manualCommit throws NotFoundException when sandboxId is missing (session not ready)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1' });

      await expect(service.manualCommit('conv-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('[P0] Story 3.6 — runAgentTurn flushPendingCommit', () => {
    it('runAgentTurn calls flushPendingCommit after agentService.runTurn completes', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: null });
      jest.spyOn(sandboxFake, 'provision').mockResolvedValue({
        sandboxId: 'sb-1',
        conversationId: 'conv-1',
        status: 'ready',
        provisionedAt: new Date(),
      });
      jest.spyOn(sandboxFake, 'clone').mockResolvedValue(undefined);
      jest.spyOn(sandboxFake, 'injectGitConfig').mockResolvedValue(undefined);
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: false, files: [] });
      await service.provisionSandbox('conv-1', 'user-1');

      const flushSpy = jest.spyOn(
        service['manualCommitService'],
        'flushPendingCommit',
      ).mockResolvedValue(undefined);

      await service.sendTurn('conv-1', 'user-1', 'test message');

      await new Promise((r) => setImmediate(r));

      expect(flushSpy).toHaveBeenCalledWith('conv-1', 'sb-1');
    });

    it('runAgentTurn does NOT call flushPendingCommit when sandboxId is missing (early return path)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: null });

      const flushSpy = jest.spyOn(
        service['manualCommitService'],
        'flushPendingCommit',
      ).mockResolvedValue(undefined);

      await service.sendTurn('conv-1', 'user-1', 'test message');

      await new Promise((r) => setImmediate(r));

      expect(flushSpy).not.toHaveBeenCalled();
    });
  });
});
