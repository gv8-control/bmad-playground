import { ConversationsModule } from '../../src/conversations/conversations.module';
import { ConversationsService } from '../../src/conversations/conversations.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CredentialsService } from '../../src/credentials/credentials.service';
import { SessionEventsService } from '../../src/streaming/session-events.service';
import { DAYTONA_CLIENT } from '../../src/sandbox/daytona-client.provider';
import { buildTestModule } from '../helpers/test-module-builder';

/**
 * Integration tests for sandbox lifecycle via the ConversationService layer.
 * SandboxServiceFake is injected — no real Daytona API calls are made.
 *
 * Covers: B-01 (fake seam), sandbox provision/destroy contract,
 * idle timeout teardown, and zombie sandbox cleanup on provision failure.
 */
describe('Sandbox lifecycle (integration)', () => {
  let conversationsService: ConversationsService;
  let sessionEvents: SessionEventsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sandboxFake: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      conversation: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: `conv-${Date.now()}`,
            userId: data.userId,
            title: null,
            lastActiveAt: data.lastActiveAt,
          }),
        ),
        findUnique: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1' }),
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
});
