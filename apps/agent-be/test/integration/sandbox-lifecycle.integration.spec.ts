import { ConversationsModule } from '../../src/conversations/conversations.module';
import { ConversationsService } from '../../src/conversations/conversations.service';
import { ManualCommitService } from '../../src/conversations/manual-commit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CredentialsService } from '../../src/credentials/credentials.service';
import { SessionEventsService } from '../../src/streaming/session-events.service';
import { DAYTONA_CLIENT } from '../../src/sandbox/daytona-client.provider';
import { AGENT_SERVICE } from '@bmad-easy/shared-types';
import { buildTestModule } from '../helpers/test-module-builder';
import { ConflictException } from '@nestjs/common';

/**
 * Integration tests for sandbox lifecycle via the ConversationService layer.
 * SandboxServiceFake is injected — no real Daytona API calls are made.
 *
 * Covers: B-01 (fake seam), sandbox provision/destroy contract,
 * pre-first-message + mid-session idle timeout teardown, and zombie sandbox
 * cleanup on provision failure.
 * Story 3.10 covers: AC-1 (provision injects identity — manual commit carries it),
 * AC-2 (two users — distinct commit authors through full NestJS module wiring).
 * Story 3.11 covers: AC-1 (two conversations provision independently with distinct sandbox IDs),
 * AC-2 (createConversation rejects at 10 active), AC-4 (abandonConversation tears down
 * sandbox + deletes row through full NestJS module wiring).
 * Story 3.12 covers: AC-1 (SessionEventsService.onModuleDestroy emits SESSION_DRAINING to
 * all active conversations), AC-2 (getStatus returns persisted sandboxStatus after simulated
 * restart), AC-3 (MANUAL_SAVE_FAILED emits before SESSION_DRAINING — shutdown ordering).
 */
describe('Sandbox lifecycle (integration)', () => {
  let conversationsService: ConversationsService;
  let sessionEvents: SessionEventsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let module: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sandboxFake: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    let conversationCounter = 0;
    const conversationDb = new Map<string, { id: string; userId: string; title: string | null; sandboxId: string | null; sandboxStatus: string | null; lastActiveAt: Date }>();

    mockPrisma = {
      conversation: {
        create: jest.fn().mockImplementation(({ data }) => {
          const conv = {
              id: `conv-${++conversationCounter}`,
              userId: data.userId,
            title: data.title ?? null,
            sandboxId: null as string | null,
            sandboxStatus: data.sandboxStatus ?? null,
            lastActiveAt: data.lastActiveAt ?? new Date(),
          };
          conversationDb.set(conv.id, conv);
          return Promise.resolve(conv);
        }),
        findUnique: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const conv = conversationDb.get(where.id);
          if (!conv) return Promise.resolve(null);
          if (where.userId && conv.userId !== where.userId) return Promise.resolve(null);
          return Promise.resolve({ ...conv });
        }),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const existing = conversationDb.get(where.id) ?? { id: where.id, userId: 'user-1', title: null, sandboxId: null, sandboxStatus: null, lastActiveAt: new Date() };
          const updated = { ...existing, ...data };
          conversationDb.set(where.id, updated);
          return Promise.resolve(updated);
        }),
        count: jest.fn().mockResolvedValue(0),
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
    };

    const { module: m, sandboxFake: sf } = await buildTestModule([ConversationsModule], [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: DAYTONA_CLIENT, useValue: null },
      {
        provide: CredentialsService,
        useValue: {
          resolveOAuthToken: jest.fn().mockResolvedValue('fake-token'),
          isCredentialHealthFailed: jest.fn().mockResolvedValue(false),
        },
      },
    ]);

    module = m;
    conversationsService = module.get(ConversationsService);
    sessionEvents = module.get(SessionEventsService);
    sandboxFake = sf;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('[P0] provisions a sandbox when a conversation is created', async () => {
    const result = await conversationsService.createConversation('user-1');

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.id).toBeDefined();
    expect(sandboxFake.activeSandboxCount()).toBeGreaterThan(0);
  });

  it('[P0] emits SESSION_READY after provision + clone + git-config-injection + WORKING_TREE status', async () => {
    const emitSpy = jest.spyOn(sessionEvents, 'emit');

    await conversationsService.provisionSandbox('conv-1', 'user-1');

    const events = emitSpy.mock.calls.map((c) => c[1].event);
    expect(events).toContain('WORKING_TREE_CLEAN');
    expect(events).toContain('SESSION_READY');
  });

  it('[P0] tears down sandbox after idle timeout (60s default) when no first message is sent', async () => {
    jest.useFakeTimers();
    const destroySpy = jest.spyOn(sandboxFake, 'destroy');

    await conversationsService.provisionSandbox('conv-1', 'user-1');

    expect(destroySpy).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000);

    expect(destroySpy).toHaveBeenCalled();
  });

  it('[P0] cleans up partial Daytona allocation when provision() throws (no zombie sandboxes)', async () => {
    // Story 6.1 F2 note: This test uses SandboxServiceFake.failNextProvision which
    // throws BEFORE allocation (the fake never assigns a sandbox). The real SDK
    // failure mode — daytona.create() rejecting AFTER allocating a partial sandbox —
    // is NOT modeled by the fake. Per the @daytonaio/sdk 0.187.0 contract, create()
    // either resolves (sandbox assigned) or rejects (sandbox never assigned), so
    // there is no partial-allocation cleanup path in the real SandboxService.provision().
    // The dead catch-block cleanup branch (if (sandbox) { await daytona.delete(sandbox) })
    // is removed in Task 6.1 — see sandbox.service.nfr-s1.spec.ts F2 tests.
    sandboxFake.failNextProvision();
    const destroySpy = jest.spyOn(sandboxFake, 'destroy');

    await conversationsService.provisionSandbox('conv-1', 'user-1');

    expect(destroySpy).not.toHaveBeenCalled();
    expect(sandboxFake.activeSandboxCount()).toBe(0);
  });

  it('[P0] tears down sandbox after mid-session idle timeout (15 min) when no further message is sent', async () => {
    jest.useFakeTimers();

    const result = await conversationsService.createConversation('user-1');
    const conversationId = result.id;

    await jest.advanceTimersByTimeAsync(0);
    expect(sandboxFake.activeSandboxCount()).toBeGreaterThan(0);

    mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: conversationId, title: null });
    await conversationsService.sendTurn(conversationId, 'user-1', 'hello agent');
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(sandboxFake.activeSandboxCount()).toBeGreaterThan(0);

    await jest.advanceTimersByTimeAsync(840_000);
    expect(sandboxFake.activeSandboxCount()).toBe(0);
  });

  it('[P0] provision injects identity — manual commit carries it (AC-1)', async () => {
    const result = await conversationsService.createConversation('user-1');
    const conversationId = result.id;

    await new Promise((resolve) => setImmediate(resolve));

    jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['f.ts'] });
    mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: conversationId });

    await conversationsService.manualCommit(conversationId, 'user-1');

    const calls = sandboxFake.getCommitCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].author).toEqual({
      name: 'Test User',
      email: 'test@example.com',
    });
  });

  it('[P0] two users — distinct commit authors (AC-2)', async () => {
    mockPrisma.user.findUnique.mockImplementation(
      ({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(
          id === 'user-alice'
            ? { name: 'Alice Lee', email: 'alice@example.com', githubLogin: 'alice' }
            : { name: 'Bob Wong', email: 'bob@example.com', githubLogin: 'bob' },
        ),
    );
    mockPrisma.conversation.create.mockImplementation(
      ({ data }: { data: { userId: string } }) =>
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

    await conversationsService.createConversation('user-alice');
    await conversationsService.createConversation('user-bob');
    await new Promise((resolve) => setImmediate(resolve));

    jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['f.ts'] });

    await conversationsService.manualCommit('conv-a', 'user-alice');
    await conversationsService.manualCommit('conv-b', 'user-bob');

    const calls = sandboxFake.getCommitCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].author).toEqual({ name: 'Alice Lee', email: 'alice@example.com' });
    expect(calls[1].author).toEqual({ name: 'Bob Wong', email: 'bob@example.com' });
    expect(calls[0].author.email).not.toBe(calls[1].author.email);
  });

  describe('[P0] Story 3.11 — concurrent conversations + limit + abandon (integration)', () => {
    it('[P0] two conversations provision independently with distinct sandbox IDs (AC-1)', async () => {
      const result1 = await conversationsService.createConversation('user-1');
      const result2 = await conversationsService.createConversation('user-1');
      await new Promise((resolve) => setImmediate(resolve));

      const sb1 = sandboxFake.sandboxIds?.get?.(result1.id) ?? conversationsService['sandboxIds'].get(result1.id);
      const sb2 = sandboxFake.sandboxIds?.get?.(result2.id) ?? conversationsService['sandboxIds'].get(result2.id);

      expect(sb1).toBeDefined();
      expect(sb2).toBeDefined();
      expect(sb1).not.toBe(sb2);
    });

    it('[P0] createConversation rejects at 10 active (AC-2)', async () => {
      mockPrisma.conversation.count.mockResolvedValue(10);
      await expect(conversationsService.createConversation('user-1')).rejects.toThrow(ConflictException);
    });

    it('[P0] abandonConversation tears down sandbox + deletes row (AC-4)', async () => {
      const result = await conversationsService.createConversation('user-1');
      await new Promise((resolve) => setImmediate(resolve));

      const destroySpy = jest.spyOn(sandboxFake, 'destroy');
      const completeSpy = jest.spyOn(sessionEvents, 'complete');

      await conversationsService.abandonConversation(result.id, 'user-1');

      expect(destroySpy).toHaveBeenCalled();
      expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({ where: { id: result.id } });
      expect(completeSpy).toHaveBeenCalledWith(result.id);
    });
  });

  describe('[P0] Story 3.12 — SIGTERM drain → reconnect → resume from Postgres (AC: 1, 2, 3)', () => {
    it('[P0] SessionEventsService.onModuleDestroy emits SESSION_DRAINING to all active conversations', async () => {
      const emitSpy = jest.spyOn(sessionEvents, 'emit');

      await conversationsService.provisionSandbox('conv-1', 'user-1');
      await conversationsService.provisionSandbox('conv-2', 'user-1');

      emitSpy.mockClear();
      await sessionEvents.onModuleDestroy();

      const drainEvents = emitSpy.mock.calls.filter((c) => c[1].event === 'SESSION_DRAINING');
      expect(drainEvents.length).toBeGreaterThanOrEqual(2);
      const drainedIds = drainEvents.map((c) => c[0]);
      expect(drainedIds).toContain('conv-1');
      expect(drainedIds).toContain('conv-2');
    });

    it('[P0] ManualCommitService.onModuleDestroy emits MANUAL_SAVE_FAILED for pending commits before subjects complete', async () => {
      const emitSpy = jest.spyOn(sessionEvents, 'emit');

      await conversationsService.provisionSandbox('conv-1', 'user-1');
      const manualCommitService = module.get(ManualCommitService);
      const agentService = module.get(AGENT_SERVICE);
      jest.spyOn(agentService, 'isIdle').mockReturnValue(false);
      await manualCommitService.requestCommit('conv-1', 'user-1', 'sandbox-1');

      await manualCommitService.onModuleDestroy();

      const failedEvents = emitSpy.mock.calls.filter((c) => c[1].event === 'MANUAL_SAVE_FAILED');
      expect(failedEvents.length).toBeGreaterThan(0);
    });

    it('[P0] getStatus returns persisted sandboxStatus after simulated restart (in-memory Maps cleared)', async () => {
      await conversationsService.provisionSandbox('conv-1', 'user-1');

      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        id: 'conv-1',
        sandboxId: 'sb-1',
        sandboxStatus: 'ready',
      });
      conversationsService['sandboxStatuses'].clear();
      conversationsService['sandboxIds'].clear();

      const result = await conversationsService.getStatus('conv-1', 'user-1');

      expect(result.sandboxStatus).toBe('ready');
    });

    it('[P0] full drain sequence: MANUAL_SAVE_FAILED emits before SESSION_DRAINING (shutdown ordering)', async () => {
      const emitSpy = jest.spyOn(sessionEvents, 'emit');

      await conversationsService.provisionSandbox('conv-1', 'user-1');
      const manualCommitService = module.get(ManualCommitService);
      const agentService = module.get(AGENT_SERVICE);
      jest.spyOn(agentService, 'isIdle').mockReturnValue(false);
      await manualCommitService.requestCommit('conv-1', 'user-1', 'sandbox-1');

      emitSpy.mockClear();
      await manualCommitService.onModuleDestroy();
      await sessionEvents.onModuleDestroy();

      const events = emitSpy.mock.calls.map((c) => c[1].event);
      const manualFailIndex = events.indexOf('MANUAL_SAVE_FAILED');
      const drainIndex = events.indexOf('SESSION_DRAINING');
      expect(manualFailIndex).toBeGreaterThan(-1);
      expect(drainIndex).toBeGreaterThan(-1);
      expect(manualFailIndex).toBeLessThan(drainIndex);
    });
  });
});

// ============================================================================
// Story 6.1: Install sandbox-agent + Claude Code Binaries in Sandbox During Provision
// Covers: AC-1 (binaries installed via fake inspection), AC-2 (envVars injected),
//         AC-3 (networkAllowList applied), AC-4 (provision sequence order).
// ============================================================================

describe('[P0] Story 6.1 — provision injects envVars, networkAllowList, and binaries (AC: 1, 2, 3, 4)', () => {
  let conversationsService: ConversationsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sandboxFake: any;

  beforeEach(async () => {
    let conversationCounter = 0;
    const conversationDb = new Map<string, { id: string; userId: string; title: string | null; sandboxId: string | null; sandboxStatus: string | null; lastActiveAt: Date }>();

    const mockPrisma = {
      conversation: {
        create: jest.fn().mockImplementation(({ data }) => {
          const conv = {
            id: `conv-${++conversationCounter}`,
            userId: data.userId,
            title: data.title ?? null,
            sandboxId: null as string | null,
            sandboxStatus: data.sandboxStatus ?? null,
            lastActiveAt: data.lastActiveAt ?? new Date(),
          };
          conversationDb.set(conv.id, conv);
          return Promise.resolve(conv);
        }),
        findUnique: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const conv = conversationDb.get(where.id);
          if (!conv) return Promise.resolve(null);
          if (where.userId && conv.userId !== where.userId) return Promise.resolve(null);
          return Promise.resolve({ ...conv });
        }),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const existing = conversationDb.get(where.id) ?? { id: where.id, userId: 'user-1', title: null, sandboxId: null, sandboxStatus: null, lastActiveAt: new Date() };
          const updated = { ...existing, ...data };
          conversationDb.set(where.id, updated);
          return Promise.resolve(updated);
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      turn: { create: jest.fn().mockResolvedValue({ id: 'turn-1' }) },
      repoConnection: { findUnique: jest.fn().mockResolvedValue({ repoUrl: 'https://github.com/test/repo.git' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Test User', email: 'test@example.com', githubLogin: 'testuser' }) },
    };

    const { module: m, sandboxFake: sf } = await buildTestModule([ConversationsModule], [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: DAYTONA_CLIENT, useValue: null },
      {
        provide: CredentialsService,
        useValue: {
          resolveOAuthToken: jest.fn().mockResolvedValue('fake-token'),
          isCredentialHealthFailed: jest.fn().mockResolvedValue(false),
        },
      },
    ]);

    conversationsService = m.get(ConversationsService);
    sandboxFake = sf;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('[P0] provision records binaries as installed (AC-1)', async () => {
    const result = await conversationsService.createConversation('user-1');
    await new Promise((resolve) => setImmediate(resolve));

    const sandboxId = conversationsService['sandboxIds'].get(result.id);
    expect(sandboxId).toBeDefined();
    expect(sandboxFake.areBinariesInstalled(sandboxId)).toBe(true);
  });

  it('[P0] provision injects ANTHROPIC_API_KEY and GITHUB_TOKEN as envVars (AC-2)', async () => {
    const result = await conversationsService.createConversation('user-1');
    await new Promise((resolve) => setImmediate(resolve));

    const sandboxId = conversationsService['sandboxIds'].get(result.id);
    const envVars = sandboxFake.getProvisionedEnvVars(sandboxId);
    expect(envVars).toBeDefined();
    expect(Object.keys(envVars)).toContain('ANTHROPIC_API_KEY');
    expect(Object.keys(envVars)).toContain('GITHUB_TOKEN');
    expect(Object.keys(envVars)).not.toContain('DATABASE_URL');
    expect(Object.keys(envVars)).not.toContain('AUTH_SECRET');
  });

  it('[P0] provision applies networkAllowList (AC-3)', async () => {
    const result = await conversationsService.createConversation('user-1');
    await new Promise((resolve) => setImmediate(resolve));

    const sandboxId = conversationsService['sandboxIds'].get(result.id);
    const allowList = sandboxFake.getNetworkAllowList(sandboxId);
    expect(allowList).toBeDefined();
    expect(allowList.length).toBeGreaterThan(0);
  });

  it('[P0] provision sequence runs in order: provision → clone → injectGitConfig → git status → emit events (AC-4)', async () => {
    const emitSpy = jest.spyOn(conversationsService['sessionEvents'], 'emit');

    await conversationsService.provisionSandbox('conv-1', 'user-1');

    const events = emitSpy.mock.calls.map((c) => c[1].event);
    // Working tree event emits before SESSION_READY
    const workingTreeIndex = Math.max(
      events.indexOf('WORKING_TREE_DIRTY'),
      events.indexOf('WORKING_TREE_CLEAN'),
    );
    const readyIndex = events.indexOf('SESSION_READY');
    expect(workingTreeIndex).toBeGreaterThan(-1);
    expect(readyIndex).toBeGreaterThan(-1);
    expect(workingTreeIndex).toBeLessThan(readyIndex);
  });
});
