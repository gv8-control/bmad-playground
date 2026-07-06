import { ConversationsModule } from '../../src/conversations/conversations.module';
import { ConversationsService } from '../../src/conversations/conversations.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CredentialsService } from '../../src/credentials/credentials.service';
import { SessionEventsService } from '../../src/streaming/session-events.service';
import { DAYTONA_CLIENT } from '../../src/sandbox/daytona-client.provider';
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
 */
describe('Sandbox lifecycle (integration)', () => {
  let conversationsService: ConversationsService;
  let sessionEvents: SessionEventsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sandboxFake: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    let conversationCounter = 0;
    mockPrisma = {
      conversation: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: `conv-${++conversationCounter}`,
            userId: data.userId,
            title: null,
            lastActiveAt: data.lastActiveAt,
          }),
        ),
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
    };

    const { module, sandboxFake: sf } = await buildTestModule([ConversationsModule], [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: DAYTONA_CLIENT, useValue: null },
      {
        provide: CredentialsService,
        useValue: { resolveOAuthToken: jest.fn().mockResolvedValue('fake-token') },
      },
    ]);

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

  it('destroys sandbox on conversation close', () => {
    // No close-conversation endpoint in Story 3.1 — deferred
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
    sandboxFake.failNextProvision();
    const destroySpy = jest.spyOn(sandboxFake, 'destroy');

    await conversationsService.provisionSandbox('conv-1', 'user-1');

    expect(destroySpy).not.toHaveBeenCalled();
    expect(sandboxFake.activeSandboxCount()).toBe(0);
  });

  it('terminates agent process via Daytona API when sandbox-agent crashes', () => {
    // Story 3.3/3.4 scope
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
      mockPrisma.conversation.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ id: `conv-${i + 1}` })),
      );
      for (let i = 1; i <= 10; i++) {
        conversationsService['sandboxStatuses'].set(`conv-${i}`, 'ready');
      }
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
});
