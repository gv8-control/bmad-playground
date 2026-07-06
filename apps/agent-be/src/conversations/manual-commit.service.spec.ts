/**
 * @jest-environment node
 *
 * Story 3.6: Track and Manually Save Working Tree State
 * Story 3.12: Drain Conversations Gracefully on Deploy
 * Unit tests for ManualCommitService.
 *
 * Covers: AC-2 (manual save via commit), AC-3 (queued save behind agent turn),
 *         AC-4 (successful save produces Semantic Pill + resets indicator),
 *         AC-5 (failed save produces error-state Tool Pill + indicator stays dirty),
 *         AC-6 (no-op on clean tree + duplicate submission prevention).
 * Story 3.12 covers: AC-3 (onModuleDestroy drain — bounded completion of pending
 * commits or MANUAL_SAVE_FAILED notification; executingCommits guard preserved;
 * async lifecycle hook).
 *
 * TDD GREEN PHASE — all tests un-skipped and passing.
 */
import { Test } from '@nestjs/testing';
import { ManualCommitService } from './manual-commit.service';
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

describe('ManualCommitService', () => {
  let service: ManualCommitService;
  let sessionEvents: SessionEventsService;
  let sandboxFake: SandboxServiceFake;
  let agentFake: AgentServiceFake;
  let emitSpy: jest.SpyInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      conversation: {
        create: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1' }),
        update: jest.fn().mockResolvedValue({ id: 'conv-1' }),
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

    service = module.get(ManualCommitService);
    sessionEvents = module.get(SessionEventsService);
    sandboxFake = sandboxFakeInstance;
    emitSpy = jest.spyOn(sessionEvents, 'emit');
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('[P0] AC-2 — commits immediately when agent is idle and tree is dirty', () => {
    it('commits with the correct message format and emits MANUAL_SAVE_SUCCEEDED + WORKING_TREE_CLEAN', async () => {
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['src/foo.ts'] });

      const result = await service.requestCommit('conv-1', 'user-1', 'sandbox-1');

      expect(result).toEqual({ committed: true, clean: false, queued: false });
      expect(sandboxFake.getCommitCalls()).toHaveLength(1);
      expect(sandboxFake.getCommitCalls()[0].message).toMatch(
        /^chore\(platform-save\): checkpoint \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]$/,
      );

      const emittedEvents = emitSpy.mock.calls.map((c) => c[1].event);
      expect(emittedEvents).toContain('MANUAL_SAVE_SUCCEEDED');
      expect(emittedEvents).toContain('WORKING_TREE_CLEAN');
    });
  });

  describe('[P0] AC-6 — returns no-op when tree is clean', () => {
    it('does NOT call commit, emits WORKING_TREE_CLEAN, returns clean=true', async () => {
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: false, files: [] });

      const result = await service.requestCommit('conv-1', 'user-1', 'sandbox-1');

      expect(result).toEqual({ committed: false, clean: true, queued: false });
      expect(sandboxFake.getCommitCalls()).toHaveLength(0);

      const emittedEvents = emitSpy.mock.calls.map((c) => c[1].event);
      expect(emittedEvents).toContain('WORKING_TREE_CLEAN');
    });
  });

  describe('[P0] AC-3 — queues commit when agent is not idle', () => {
    it('does NOT call commit, returns queued=true', async () => {
      agentFake.setActiveRun(true);

      const result = await service.requestCommit('conv-1', 'user-1', 'sandbox-1');

      expect(result).toEqual({ committed: false, clean: false, queued: true });
      expect(sandboxFake.getCommitCalls()).toHaveLength(0);
    });
  });

  describe('[P0] AC-3 — flushPendingCommit executes queued commit after agent idle', () => {
    it('executes the queued commit after agent becomes idle', async () => {
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['src/foo.ts'] });
      agentFake.setActiveRun(true);

      await service.requestCommit('conv-1', 'user-1', 'sandbox-1');
      expect(sandboxFake.getCommitCalls()).toHaveLength(0);

      agentFake.setActiveRun(false);
      await service.flushPendingCommit('conv-1', 'sandbox-1');

      expect(sandboxFake.getCommitCalls()).toHaveLength(1);
      const emittedEvents = emitSpy.mock.calls.map((c) => c[1].event);
      expect(emittedEvents).toContain('MANUAL_SAVE_SUCCEEDED');
    });
  });

  describe('[P0] — flushPendingCommit is no-op when no pending commit', () => {
    it('does NOT call commit when there is no pending commit', async () => {
      await service.flushPendingCommit('conv-1', 'sandbox-1');

      expect(sandboxFake.getCommitCalls()).toHaveLength(0);
    });
  });

  describe('[P0] AC-5 — failed commit emits MANUAL_SAVE_FAILED and does NOT emit WORKING_TREE_CLEAN', () => {
    it('emits MANUAL_SAVE_FAILED, does NOT emit WORKING_TREE_CLEAN, indicator stays dirty', async () => {
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['src/foo.ts'] });
      sandboxFake.failNextCommit();

      const result = await service.requestCommit('conv-1', 'user-1', 'sandbox-1');

      expect(result).toEqual({ committed: false, clean: false, queued: false });

      const emittedEvents = emitSpy.mock.calls.map((c) => c[1].event);
      expect(emittedEvents).toContain('MANUAL_SAVE_FAILED');
      expect(emittedEvents).not.toContain('WORKING_TREE_CLEAN');
    });
  });

  describe('[P0] AC-6 — duplicate requestCommit while already queued', () => {
    it('returns queued=true without double-queueing', async () => {
      agentFake.setActiveRun(true);

      const result1 = await service.requestCommit('conv-1', 'user-1', 'sandbox-1');
      const result2 = await service.requestCommit('conv-1', 'user-1', 'sandbox-1');

      expect(result1).toEqual({ committed: false, clean: false, queued: true });
      expect(result2).toEqual({ committed: false, clean: false, queued: true });
      expect(sandboxFake.getCommitCalls()).toHaveLength(0);
    });
  });

  describe('[P1] AC-2 — commit message format', () => {
    it('matches exact format chore(platform-save): checkpoint [<ISO8601 UTC>]', async () => {
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['src/foo.ts'] });

      await service.requestCommit('conv-1', 'user-1', 'sandbox-1');

      expect(sandboxFake.getCommitCalls()).toHaveLength(1);
      expect(sandboxFake.getCommitCalls()[0].message).toMatch(
        /^chore\(platform-save\): checkpoint \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]$/,
      );
    });
  });

  describe('[P1] — executeCommit never throws', () => {
    it('errors are caught and emitted as MANUAL_SAVE_FAILED, not thrown', async () => {
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['src/foo.ts'] });
      sandboxFake.failNextCommit();

      await expect(service.requestCommit('conv-1', 'user-1', 'sandbox-1')).resolves.toEqual({
        committed: false,
        clean: false,
        queued: false,
      });
    });
  });

  describe('[P0] Story 3.12 — onModuleDestroy drains pending commits (AC: 3, P2)', () => {
    it('[P0] onModuleDestroy emits MANUAL_SAVE_FAILED for each pending commit', async () => {
      agentFake.setActiveRun(true);
      await service.requestCommit('conv-1', 'user-1', 'sandbox-1');

      await service.onModuleDestroy();

      const drainFailedEvents = emitSpy.mock.calls
        .filter((c) => c[1].event === 'MANUAL_SAVE_FAILED')
        .map((c) => c[1].data);
      expect(drainFailedEvents.length).toBeGreaterThan(0);
      expect(drainFailedEvents.some((d) => d.error && typeof d.error === 'string')).toBe(true);
    });

    it('[P0] onModuleDestroy does NOT silently drop pending commits (clear without emit is forbidden)', async () => {
      agentFake.setActiveRun(true);
      await service.requestCommit('conv-1', 'user-1', 'sandbox-1');

      const emitCountBefore = emitSpy.mock.calls.filter((c) => c[1].event === 'MANUAL_SAVE_FAILED').length;
      await service.onModuleDestroy();
      const emitCountAfter = emitSpy.mock.calls.filter((c) => c[1].event === 'MANUAL_SAVE_FAILED').length;

      expect(emitCountAfter).toBeGreaterThan(emitCountBefore);
    });

    it('[P0] onModuleDestroy attempts bounded completion of pending commits before emitting failure', async () => {
      jest.useFakeTimers();
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['src/foo.ts'] });
      agentFake.setActiveRun(true);
      await service.requestCommit('conv-1', 'user-1', 'sandbox-1');

      const commitSpy = jest.spyOn(sandboxFake, 'commit');
      agentFake.setActiveRun(false);

      const drainPromise = service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(0);
      await drainPromise;

      expect(commitSpy).toHaveBeenCalled();
    });

    it('[P0] onModuleDestroy emits MANUAL_SAVE_FAILED when completion attempt times out (NFR-P5 ≤ 5s budget)', async () => {
      jest.useFakeTimers();
      jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockImplementation(
        () => new Promise(() => undefined),
      );
      agentFake.setActiveRun(true);
      await service.requestCommit('conv-1', 'user-1', 'sandbox-1');
      agentFake.setActiveRun(false);

      const drainPromise = service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(5001);
      await drainPromise;

      const drainFailedEvents = emitSpy.mock.calls
        .filter((c) => c[1].event === 'MANUAL_SAVE_FAILED')
        .map((c) => c[1].data);
      expect(drainFailedEvents.length).toBeGreaterThan(0);
    });

    it('[P0] onModuleDestroy emits MANUAL_SAVE_FAILED for in-flight executingCommits entries (does not start a parallel commit)', async () => {
      const commitSpy = jest.spyOn(sandboxFake, 'commit');
      service['executingCommits'].add('conv-1');

      await service.onModuleDestroy();

      const drainFailedEvents = emitSpy.mock.calls.filter(
        (c) => c[1].event === 'MANUAL_SAVE_FAILED',
      );
      expect(drainFailedEvents.length).toBeGreaterThan(0);
      expect(commitSpy).not.toHaveBeenCalled();
    });

    it('[P0] onModuleDestroy is async (NestJS awaits async lifecycle hooks)', async () => {
      const result = service.onModuleDestroy();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });
});
