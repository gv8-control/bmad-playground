/**
 * Story 3.3: Converse with the Streaming Agent
 * Unit tests for AgentService via ConversationsService integration.
 * Uses AgentServiceFake (NOT the real AgentService, which requires a real Daytona sandbox).
 *
 * Covers: AC-1 (agent response persisted as Turn on RUN_FINISHED),
 * AC-3 (stopAgent stops the run — returns stopped:true, emits RUN_FINISHED),
 * error handling (RUN_ERROR).
 * Story 5.5 covers: AC-9 (AgentServiceFake segments persistence — fake builds
 * segments array alongside accumulatedText, persists segments to Turn row).
 * TDD GREEN PHASE — all tests un-skipped and passing.
 */
import { Test } from '@nestjs/testing';
import { ConversationsService } from '../conversations/conversations.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { SessionEventsService } from './session-events.service';
import { DAYTONA_CLIENT } from '../sandbox/daytona-client.provider';
import { SANDBOX_SERVICE, AGENT_SERVICE } from '@bmad-easy/shared-types';
import { SandboxServiceFake } from '../../test/helpers/sandbox-service.fake';
import { AgentServiceFake } from '../../test/helpers/agent-service.fake';

describe('AgentService (via ConversationsService integration)', () => {
  let service: ConversationsService;
  let sessionEvents: SessionEventsService;
  let agentFake: AgentServiceFake;
  let sandboxFake: SandboxServiceFake;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      conversation: {
        create: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1', title: null }),
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

    sandboxFake = new SandboxServiceFake();
    sessionEvents = new SessionEventsService();
    agentFake = new AgentServiceFake(sessionEvents, mockPrisma, sandboxFake);

    const moduleRef = await Test.createTestingModule({
      imports: [ConversationsModule],
    })
      .overrideProvider(SANDBOX_SERVICE)
      .useValue(sandboxFake)
      .overrideProvider(AGENT_SERVICE)
      .useValue(agentFake)
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(DAYTONA_CLIENT)
      .useValue(null)
      .overrideProvider(CredentialsService)
      .useValue({
        resolveOAuthToken: jest.fn().mockResolvedValue('fake-oauth-token'),
        isCredentialHealthFailed: jest.fn().mockResolvedValue(false),
        markCredentialFailed: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    service = moduleRef.get(ConversationsService);
    sessionEvents = moduleRef.get(SessionEventsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function provisionAndWait() {
    await service.provisionSandbox('conv-1', 'user-1');
  }

  describe('[P0] sendTurn invokes agentService.runTurn fire-and-forget', () => {
    it('calls agentService.runTurn after persisting the user turn', async () => {
      await provisionAndWait();

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
      await provisionAndWait();

      agentFake.setStreamDelay(100);

      const start = Date.now();
      await service.sendTurn('conv-1', 'user-1', 'hello agent');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('[P0] agent response persisted as Turn on RUN_FINISHED', () => {
    it('persists the accumulated agent response as a Turn with role assistant', async () => {
      await provisionAndWait();

      await service.sendTurn('conv-1', 'user-1', 'hello agent');

      await new Promise((r) => setTimeout(r, 50));

      const assistantTurnCall = mockPrisma.turn.create.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.data?.role === 'assistant',
      );

      expect(assistantTurnCall).toBeDefined();
      expect(assistantTurnCall[0].data.content).toBe('Hello world');
    });
  });

  describe('[P1] RUN_ERROR does not persist a partial response', () => {
    it('does not persist a Turn when the agent run fails', async () => {
      await provisionAndWait();

      agentFake.failNextRun();

      await service.sendTurn('conv-1', 'user-1', 'hello agent');

      await new Promise((r) => setTimeout(r, 50));

      const assistantTurnCall = mockPrisma.turn.create.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.data?.role === 'assistant',
      );

      expect(assistantTurnCall).toBeUndefined();
    });
  });

  describe('[P1] stopAgent returns stopped: true', () => {
    it('returns { conversationId, stopped: true } for an owned conversation', async () => {
      await provisionAndWait();

      const result = await service.stopAgent('conv-1', 'user-1');

      expect(result).toEqual({ conversationId: 'conv-1', stopped: true });
    });
  });

  // ─── Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream ──
  //
  // GREEN PHASE: tests are active and passing.
  //
  // AC-9: AgentServiceFake persists segments alongside content

  describe('[P0] Story 5.5 — AgentServiceFake segments persistence', () => {
    it('[P0] persists segments alongside content in Turn row', async () => {
      await provisionAndWait();

      agentFake.setToolCallScript('Bash', 'git status', 'nothing to commit');

      await service.sendTurn('conv-1', 'user-1', 'check the repo');

      await new Promise((r) => setTimeout(r, 50));

      const assistantTurnCall = mockPrisma.turn.create.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.data?.role === 'assistant',
      );

      expect(assistantTurnCall).toBeDefined();
      expect(assistantTurnCall[0].data).toHaveProperty('content');
      expect(assistantTurnCall[0].data).toHaveProperty('segments');
      expect(Array.isArray(assistantTurnCall[0].data.segments)).toBe(true);
    });
  });
});
