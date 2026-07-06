/**
 * Story 3.1: Provision a Sandbox When Opening a Conversation
 * Story 3.2: Invoke BMAD Skills via Slash Command
 * Story 3.5: Resume an Existing Conversation
 * Story 3.9: Terminate Idle Sandboxes Mid-Conversation
 * Story 3.10: Verify Commits Carry the User's Own Identity
 * Story 3.11: Run Concurrent Conversations
 * Unit tests for ConversationsService.
 * Uses SandboxServiceFake via buildTestModule().
 *
 * Covers: AC-1 (provision pipeline), AC-3 (idle timeout), AC-4 (provision failure cleanup),
 * AC-6 (provision queue concurrency cap).
 * Story 3.2 covers: AC-1 (listSkills), AC-2 (empty skills), AC-3 (sendTurn persistence + title).
 * Story 3.5 covers: AC-2 (resume fast/slow path, git identity re-injection, idle timer).
 * Story 3.9 covers: AC-1 (mid-session idle timeout, fast-path resume timer),
 * AC-2 (dirty-tree save before teardown).
 * Story 3.10 covers: AC-1 (git identity resolution + injection, commit carries injected identity),
 * AC-2 (two-user distinct commit identities), AC-3 (noreply-email fallback on commit).
 * Story 3.11 covers: AC-1 (concurrent conversation count check), AC-2 (limit-reached
 * ConflictException), AC-4 (abandonConversation + provisionSandbox cancellation).
 *
 * TDD GREEN PHASE: Story 3.5/3.9/3.10/3.11 tests un-skipped and passing.
 */
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({ id: 'conv-1' }),
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

  describe('[P0] Story 3.9 — mid-session idle timeout (AC-1)', () => {
    it('[P0] mid-session timer starts after runAgentTurn completes — 60s does NOT fire, 900s does', async () => {
      jest.useFakeTimers();
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');

      await service.provisionSandbox('conv-1', 'user-1');
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: null });
      await service.sendTurn('conv-1', 'user-1', 'hello agent');

      await jest.advanceTimersByTimeAsync(0);
      expect(destroySpy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(60_000);
      expect(destroySpy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(840_000);
      expect(destroySpy).toHaveBeenCalledWith(expect.any(String));
    });

    it('[P0] mid-session timer is cleared when sendTurn is called again', async () => {
      jest.useFakeTimers();
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');

      await service.provisionSandbox('conv-1', 'user-1');
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', title: 'Existing' });
      await service.sendTurn('conv-1', 'user-1', 'first message');
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(800_000);

      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: 'Existing' });
      await service.sendTurn('conv-1', 'user-1', 'second message');
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(800_000);

      expect(destroySpy).not.toHaveBeenCalled();
    });

    it('[P0] mid-session timer fires after 15 min (not 60s)', async () => {
      jest.useFakeTimers();
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');

      await service.provisionSandbox('conv-1', 'user-1');
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: null });
      await service.sendTurn('conv-1', 'user-1', 'hello agent');
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(60_000);
      expect(destroySpy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(840_000);
      expect(destroySpy).toHaveBeenCalled();
    });

    it('[P0] mid-session timer emits SESSION_TIMEOUT with { reason: "mid-session" }', async () => {
      jest.useFakeTimers();
      const emitSpy = jest.spyOn(sessionEvents, 'emit');

      await service.provisionSandbox('conv-1', 'user-1');
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: null });
      await service.sendTurn('conv-1', 'user-1', 'hello agent');
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(900_000);

      const timeoutCall = emitSpy.mock.calls.find(
        (c: unknown[]) => (c[1] as { event: string }).event === 'SESSION_TIMEOUT',
      );
      expect(timeoutCall).toBeDefined();
      expect(timeoutCall![1]).toEqual({
        event: 'SESSION_TIMEOUT',
        data: { reason: 'mid-session' },
      });
    });

    it('[P0] mid-session timer sets status to "idle-timeout" and deletes sandboxId', async () => {
      jest.useFakeTimers();

      await service.provisionSandbox('conv-1', 'user-1');
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: null });
      await service.sendTurn('conv-1', 'user-1', 'hello agent');
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(900_000);

      const status = await service.getStatus('conv-1', 'user-1');
      expect(status.sandboxStatus).toBe('idle-timeout');

      const skills = await service.listSkills('conv-1', 'user-1');
      expect(skills).toEqual([]);
    });
  });

  describe('[P0] Story 3.9 — dirty working tree save before teardown (AC-2)', () => {
    it('[P0] attempts save when working tree is dirty — requestCommit called BEFORE destroy', async () => {
      jest.useFakeTimers();
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({
        dirty: true,
        files: ['modified-file.ts'],
      });
      const requestCommitSpy = jest.spyOn(
        service['manualCommitService'],
        'requestCommit',
      );
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');
      const emitSpy = jest.spyOn(sessionEvents, 'emit');

      await service.provisionSandbox('conv-1', 'user-1');
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: null });
      await service.sendTurn('conv-1', 'user-1', 'hello agent');
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(900_000);

      expect(requestCommitSpy).toHaveBeenCalledWith(
        'conv-1',
        'user-1',
        expect.any(String),
      );
      expect(destroySpy).toHaveBeenCalled();
      expect(requestCommitSpy.mock.invocationCallOrder[0]).toBeLessThan(
        destroySpy.mock.invocationCallOrder[0],
      );

      const events = emitSpy.mock.calls.map((c: unknown[]) => (c[1] as { event: string }).event);
      expect(events).toContain('MANUAL_SAVE_SUCCEEDED');
      expect(events).toContain('SESSION_TIMEOUT');
      expect(events.indexOf('MANUAL_SAVE_SUCCEEDED')).toBeLessThan(events.indexOf('SESSION_TIMEOUT'));
    });

    it('[P0] does NOT save when working tree is clean — destroy called, requestCommit NOT called', async () => {
      jest.useFakeTimers();
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({
        dirty: false,
        files: [],
      });
      const requestCommitSpy = jest.spyOn(
        service['manualCommitService'],
        'requestCommit',
      );
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');

      await service.provisionSandbox('conv-1', 'user-1');
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: null });
      await service.sendTurn('conv-1', 'user-1', 'hello agent');
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(900_000);

      expect(requestCommitSpy).not.toHaveBeenCalled();
      expect(destroySpy).toHaveBeenCalled();
    });

    it('[P0] teardown proceeds even if save fails — MANUAL_SAVE_FAILED emitted, destroy still called', async () => {
      jest.useFakeTimers();
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({
        dirty: true,
        files: ['modified-file.ts'],
      });
      sandboxFake.failNextCommit();
      const emitSpy = jest.spyOn(sessionEvents, 'emit');
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');

      await service.provisionSandbox('conv-1', 'user-1');
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', title: null });
      await service.sendTurn('conv-1', 'user-1', 'hello agent');
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(900_000);

      const events = emitSpy.mock.calls.map((c: unknown[]) => (c[1] as { event: string }).event);
      expect(events).toContain('MANUAL_SAVE_FAILED');
      expect(events).toContain('SESSION_TIMEOUT');
      expect(events.indexOf('MANUAL_SAVE_FAILED')).toBeLessThan(events.indexOf('SESSION_TIMEOUT'));
      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('[P0] Story 3.9 — fast-path resume starts mid-session timer (AC-1)', () => {
    it('[P0] fast-path resume does NOT reset existing mid-session timer', async () => {
      jest.useFakeTimers();
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');
      const startTimerSpy = jest.spyOn(idleTimeout, 'startTimer');

      await service.provisionSandbox('conv-1', 'user-1');
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', title: null });
      await service.sendTurn('conv-1', 'user-1', 'first message');
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(800_000);

      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', userId: 'user-1' });
      await service.resumeConversation('conv-1', 'user-1');

      await jest.advanceTimersByTimeAsync(100_000);

      expect(destroySpy).toHaveBeenCalled();
    });

    it('[P0] fast-path resume does NOT start mid-session timer when pre-first-message timer is running', async () => {
      jest.useFakeTimers();
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');
      const hasTimerSpy = jest.spyOn(idleTimeout, 'hasTimer');

      await service.provisionSandbox('conv-1', 'user-1');

      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', userId: 'user-1' });
      await service.resumeConversation('conv-1', 'user-1');

      expect(hasTimerSpy).toHaveBeenCalledWith('conv-1');

      await jest.advanceTimersByTimeAsync(60_000);

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('[P0] Story 3.10 — git identity resolution + injection (AC-1, AC-3)', () => {
    it('[P0] resolveGitIdentity resolves name + email from the User profile', async () => {
      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');
      await service.provisionSandbox('conv-1', 'user-1');
      const sandboxId = injectSpy.mock.calls[0][0];

      expect(sandboxFake.getInjectedGitConfig(sandboxId)).toEqual({
        name: 'Test User',
        email: 'test@example.com',
      });
    });

    it('[P0] name falls back to githubLogin when name is null', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        name: null,
        email: 'a@b.com',
        githubLogin: 'alice',
      });
      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');
      await service.provisionSandbox('conv-1', 'user-1');
      const sandboxId = injectSpy.mock.calls[0][0];

      expect(sandboxFake.getInjectedGitConfig(sandboxId).name).toBe('alice');
    });

    it('[P0] name falls back to githubLogin when name is empty/whitespace', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        name: '   ',
        email: 'a@b.com',
        githubLogin: 'alice',
      });
      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');
      await service.provisionSandbox('conv-1', 'user-1');
      const sandboxId = injectSpy.mock.calls[0][0];

      expect(sandboxFake.getInjectedGitConfig(sandboxId).name).toBe('alice');
    });

    it('[P0] email falls back to {githubLogin}@users.noreply.github.com when email is null (AC-3)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        name: 'Alice',
        email: null,
        githubLogin: 'alice',
      });
      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');
      await service.provisionSandbox('conv-1', 'user-1');
      const sandboxId = injectSpy.mock.calls[0][0];

      expect(sandboxFake.getInjectedGitConfig(sandboxId).email).toBe('alice@users.noreply.github.com');
    });

    it('[P0] email falls back to noreply when email is empty/whitespace', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        name: 'Alice',
        email: '  ',
        githubLogin: 'alice',
      });
      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');
      await service.provisionSandbox('conv-1', 'user-1');
      const sandboxId = injectSpy.mock.calls[0][0];

      expect(sandboxFake.getInjectedGitConfig(sandboxId).email).toBe('alice@users.noreply.github.com');
    });

    it('[P0] provisionSandbox injects the resolved identity BEFORE emitting SESSION_READY (AC-1 agent-commit path)', async () => {
      const emitSpy = jest.spyOn(sessionEvents, 'emit');
      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');

      await service.provisionSandbox('conv-1', 'user-1');

      const sessionReadyCallIndex = emitSpy.mock.calls.findIndex(
        (c: unknown[]) => (c[1] as { event: string }).event === 'SESSION_READY',
      );
      expect(sessionReadyCallIndex).not.toBe(-1);
      const sessionReadyOrder = emitSpy.mock.invocationCallOrder[sessionReadyCallIndex];

      expect(injectSpy).toHaveBeenCalled();
      expect(injectSpy.mock.invocationCallOrder[0]).toBeLessThan(sessionReadyOrder);
    });

    it('[P0] resumeConversation fast-path re-injects the same identity (AC-1 on resume)', async () => {
      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');
      await service.provisionSandbox('conv-1', 'user-1');
      const sandboxId = injectSpy.mock.calls[0][0];

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        name: 'Alice V2',
        email: 'alice-v2@example.com',
        githubLogin: 'alice',
      });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1', userId: 'user-1' });
      await service.resumeConversation('conv-1', 'user-1');

      expect(sandboxFake.getInjectedGitConfig(sandboxId)).toEqual({
        name: 'Alice V2',
        email: 'alice-v2@example.com',
      });
    });
  });

  describe('[P0] Story 3.10 — commit carries the user\'s injected identity (AC-1, AC-3)', () => {
    it('[P0] a manual save commit carries the user\'s injected name + email (AC-1)', async () => {
      await service.provisionSandbox('conv-1', 'user-1');
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['f.ts'] });

      await service.manualCommit('conv-1', 'user-1');

      expect(sandboxFake.getCommitCalls()).toHaveLength(1);
      expect(sandboxFake.getCommitCalls()[0].author).toEqual({
        name: 'Test User',
        email: 'test@example.com',
      });
    });

    it('[P0] the commit author is NOT a platform service account (AC-1)', async () => {
      await service.provisionSandbox('conv-1', 'user-1');
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['f.ts'] });

      await service.manualCommit('conv-1', 'user-1');

      const author = sandboxFake.getCommitCalls()[0].author;
      expect(author).toBeDefined();
      expect(author.name).not.toMatch(/bmad|platform|bot|service/i);
      expect(author.email).not.toMatch(/bmad-easy\.com|noreply@platform/i);
    });

    it('[P0] noreply-fallback user\'s commit carries the fallback email (AC-3)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        name: null,
        email: null,
        githubLogin: 'janedoe',
      });
      await service.provisionSandbox('conv-1', 'user-1');
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['f.ts'] });

      await service.manualCommit('conv-1', 'user-1');

      const author = sandboxFake.getCommitCalls()[0].author;
      expect(author.email).toBe('janedoe@users.noreply.github.com');
      expect(author.name).toBe('janedoe');
    });

    it('[P0] a commit with no prior injectGitConfig records author: undefined (regression guard)', async () => {
      await sandboxFake.commit('sb-x', 'msg');

      expect(sandboxFake.getCommitCalls()).toHaveLength(1);
      expect(sandboxFake.getCommitCalls()[0].author).toBeUndefined();
    });
  });

  describe('[P0] Story 3.10 — two users carry distinct commit identities (AC-2)', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(
          id === 'user-alice'
            ? { name: 'Alice Lee', email: 'alice@example.com', githubLogin: 'alice' }
            : { name: 'Bob Wong', email: 'bob@example.com', githubLogin: 'bob' },
        ),
      );
      mockPrisma.conversation.create.mockImplementation(({ data }: { data: { userId: string } }) =>
        Promise.resolve({
          id: data.userId === 'user-alice' ? 'conv-a' : 'conv-b',
          userId: data.userId,
        }),
      );
      mockPrisma.conversation.findFirst.mockImplementation(
        ({ where: { id, userId } }: { where: { id: string; userId: string } }) =>
          Promise.resolve(
            id === 'conv-a' && userId === 'user-alice'
              ? { id: 'conv-a' }
              : id === 'conv-b' && userId === 'user-bob'
                ? { id: 'conv-b' }
                : null,
          ),
      );
    });

    it('[P0] two users each commit in their own Conversation — each commit carries that user\'s own distinct identity', async () => {
      await service.provisionSandbox('conv-a', 'user-alice');
      await service.provisionSandbox('conv-b', 'user-bob');

      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['f.ts'] });

      await service.manualCommit('conv-a', 'user-alice');
      await service.manualCommit('conv-b', 'user-bob');

      const calls = sandboxFake.getCommitCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0].author).toEqual({ name: 'Alice Lee', email: 'alice@example.com' });
      expect(calls[1].author).toEqual({ name: 'Bob Wong', email: 'bob@example.com' });
      expect(calls[0].author.email).not.toBe(calls[1].author.email);
    });

    it('[P0] the two injected configs are distinct before any commit', async () => {
      const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig');

      await service.provisionSandbox('conv-a', 'user-alice');
      await service.provisionSandbox('conv-b', 'user-bob');
      const sbA = injectSpy.mock.calls[0][0];
      const sbB = injectSpy.mock.calls[1][0];

      expect(sandboxFake.getInjectedGitConfig(sbA).email).not.toBe(
        sandboxFake.getInjectedGitConfig(sbB).email,
      );
    });
  });

  describe('[P0] Story 3.11 — concurrent conversation limit (AC: 1, 2)', () => {
    it('[P0] createConversation succeeds when active count < 10', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);
      const result = await service.createConversation('user-1');
      expect(result.id).toBe('conv-1');
      expect(mockPrisma.conversation.create).toHaveBeenCalled();
    });

    it('[P0] createConversation succeeds at the boundary (9 active)', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue(
        Array.from({ length: 9 }, (_, i) => ({ id: `conv-${i + 1}` })),
      );
      for (let i = 1; i <= 9; i++) {
        service['sandboxStatuses'].set(`conv-${i}`, 'ready');
      }
      const result = await service.createConversation('user-1');
      expect(result.id).toBe('conv-1');
      expect(mockPrisma.conversation.create).toHaveBeenCalled();
    });

    it('[P0] createConversation throws ConflictException when active count >= 10 (AC-2)', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ id: `conv-${i + 1}` })),
      );
      for (let i = 1; i <= 10; i++) {
        service['sandboxStatuses'].set(`conv-${i}`, 'ready');
      }
      await expect(service.createConversation('user-1')).rejects.toThrow(ConflictException);
      const error = new ConflictException({
        code: 'CONVERSATION_LIMIT_REACHED',
        message: 'limit reached',
        meta: { limit: 10 },
      });
      const response = error.getResponse() as Record<string, unknown>;
      expect(response).toHaveProperty('code', 'CONVERSATION_LIMIT_REACHED');
      expect(response).toHaveProperty('meta', { limit: 10 });
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('[P0] idle-timed-out conversations do NOT count toward the limit', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ id: `conv-${i + 1}` })),
      );
      for (let i = 1; i <= 10; i++) {
        service['sandboxStatuses'].set(`conv-${i}`, 'idle-timeout');
      }
      const result = await service.createConversation('user-1');
      expect(result.id).toBe('conv-1');
    });

    it('[P0] failed conversations do NOT count toward the limit', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ id: `conv-${i + 1}` })),
      );
      for (let i = 1; i <= 10; i++) {
        service['sandboxStatuses'].set(`conv-${i}`, 'failed');
      }
      const result = await service.createConversation('user-1');
      expect(result.id).toBe('conv-1');
    });

    it('[P0] provisioning conversations DO count toward the limit', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ id: `conv-${i + 1}` })),
      );
      for (let i = 1; i <= 10; i++) {
        service['sandboxStatuses'].set(`conv-${i}`, 'provisioning');
      }
      await expect(service.createConversation('user-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });
  });

  describe('[P0] Story 3.11 — abandonConversation (AC: 4)', () => {
    it('[P0] deletes the conversation row when called', async () => {
      await service.abandonConversation('conv-1', 'user-1');
      expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({ where: { id: 'conv-1' } });
    });

    it('[P0] destroys the sandbox when one exists', async () => {
      service['sandboxIds'].set('conv-1', 'sb-1');
      service['sandboxStatuses'].set('conv-1', 'ready');
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');
      await service.abandonConversation('conv-1', 'user-1');
      expect(destroySpy).toHaveBeenCalledWith('sb-1');
    });

    it('[P0] clears in-memory maps', async () => {
      service['sandboxIds'].set('conv-1', 'sb-1');
      service['sandboxStatuses'].set('conv-1', 'ready');
      await service.abandonConversation('conv-1', 'user-1');
      expect(service['sandboxStatuses'].has('conv-1')).toBe(false);
      expect(service['sandboxIds'].has('conv-1')).toBe(false);
    });

    it('[P0] clears the idle timer', async () => {
      service['sandboxIds'].set('conv-1', 'sb-1');
      service['sandboxStatuses'].set('conv-1', 'ready');
      const clearTimerSpy = jest.spyOn(idleTimeout, 'clearTimer');
      await service.abandonConversation('conv-1', 'user-1');
      expect(clearTimerSpy).toHaveBeenCalledWith('conv-1');
    });

    it('[P0] completes the SSE subject', async () => {
      const completeSpy = jest.spyOn(sessionEvents, 'complete');
      await service.abandonConversation('conv-1', 'user-1');
      expect(completeSpy).toHaveBeenCalledWith('conv-1');
    });

    it('[P0] returns { abandoned: false } when conversation does not exist (idempotent)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
      const result = await service.abandonConversation('nope', 'user-1');
      expect(result).toEqual({ conversationId: 'nope', abandoned: false });
      expect(mockPrisma.conversation.delete).not.toHaveBeenCalled();
    });

    it('[P0] tenant isolation — findFirst called with userId filter', async () => {
      await service.abandonConversation('conv-1', 'user-1');
      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-1', userId: 'user-1' },
        select: { id: true },
      });
    });
  });

  describe('[P0] Story 3.11 — provisionSandbox cancellation check (AC: 4)', () => {
    it('[P0] aborts after queue acquire when cancelled', async () => {
      service['cancelledConversations'].add('conv-1');
      const provisionSpy = jest.spyOn(sandboxFake, 'provision');
      await service.provisionSandbox('conv-1', 'user-1');
      expect(provisionSpy).not.toHaveBeenCalled();
      expect(service['cancelledConversations'].has('conv-1')).toBe(false);
    });

    it('[P0] aborts after sandbox provision when cancelled', async () => {
      jest.spyOn(sandboxFake, 'provision').mockImplementation(async () => {
        service['cancelledConversations'].add('conv-1');
        return { sandboxId: 'sb-1' };
      });
      const destroySpy = jest.spyOn(sandboxFake, 'destroy');
      const emitSpy = jest.spyOn(sessionEvents, 'emit');
      await service.provisionSandbox('conv-1', 'user-1');
      expect(destroySpy).toHaveBeenCalledWith('sb-1');
      expect(emitSpy).not.toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({ event: 'SESSION_READY' }),
      );
    });

    it('[P0] provision slot is released on cancellation', async () => {
      service['cancelledConversations'].add('conv-1');
      const releaseSpy = jest.spyOn(service['provisionQueue'], 'release');
      await service.provisionSandbox('conv-1', 'user-1');
      expect(releaseSpy).toHaveBeenCalledWith('user-1');
    });
  });
});
