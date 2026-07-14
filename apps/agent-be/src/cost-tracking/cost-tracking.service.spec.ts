/**
 * @jest-environment node
 *
 * Story 3.8: Track Per-User LLM Spend
 * Unit tests for CostTrackingService.
 *
 * Covers: AC-1 (cost recorded per turn from SDK cost reporting),
 *         AC-2 (budget alert fires when monthly spend exceeds threshold).
 *
 */
import { CostTrackingService } from './cost-tracking.service';

describe('CostTrackingService (Story 3.8 — AC-1, AC-2)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let service: CostTrackingService;

  beforeEach(() => {
    mockPrisma = {
      costRecord: {
        create: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: 0 } }),
      },
    };

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('./cost-tracking.service');
      service = new mod.CostTrackingService(mockPrisma);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('[P0] AC-1 — recordCost inserts cost record', () => {
    it('calls prisma.costRecord.create with correct fields (userId, conversationId, costUsd, sessionId, numTurns, durationMs)', async () => {
      await service.recordCost({
        userId: 'user-1',
        conversationId: 'conv-1',
        totalCostUsd: 0.42,
        sessionId: 'sess-1',
        numTurns: 3,
        durationMs: 5000,
      });

      expect(mockPrisma.costRecord.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          conversationId: 'conv-1',
          costUsd: 0.42,
          sessionId: 'sess-1',
          numTurns: 3,
          durationMs: 5000,
        },
      });
    });

    it('does NOT throw when prisma.costRecord.create fails — logs via logger.error and swallows', async () => {
      mockPrisma.costRecord.create.mockRejectedValue(new Error('DB connection lost'));
      const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

      await expect(
        service.recordCost({
          userId: 'user-1',
          conversationId: 'conv-1',
          totalCostUsd: 0.42,
          sessionId: 'sess-1',
          numTurns: 3,
          durationMs: 5000,
        }),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to record cost for user user-1'),
      );
    });
  });

  describe('[P0] AC-2 — budget alert after cost record', () => {
    it('calls checkBudgetAlert after inserting the cost record', async () => {
      const spy = jest.spyOn(service as unknown as { checkBudgetAlert: () => Promise<void> }, 'checkBudgetAlert').mockResolvedValue(undefined);

      await service.recordCost({
        userId: 'user-1',
        conversationId: 'conv-1',
        totalCostUsd: 0.42,
        sessionId: 'sess-1',
        numTurns: 3,
        durationMs: 5000,
      });

      expect(spy).toHaveBeenCalledWith('user-1');
    });

    it('checkBudgetAlert queries prisma.costRecord.aggregate with where: { userId, createdAt: { gte: monthStart } } and _sum: { costUsd: true }', async () => {
      await service.recordCost({
        userId: 'user-1',
        conversationId: 'conv-1',
        totalCostUsd: 0.42,
        sessionId: 'sess-1',
        numTurns: 3,
        durationMs: 5000,
      });

      expect(mockPrisma.costRecord.aggregate).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          createdAt: { gte: expect.any(Date) },
        },
        _sum: { costUsd: true },
      });
    });

    it('logs logger.warn when month-to-date sum exceeds threshold (mock aggregate $25, threshold $20)', async () => {
      mockPrisma.costRecord.aggregate.mockResolvedValue({ _sum: { costUsd: 25 } });
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      await service.recordCost({
        userId: 'user-1',
        conversationId: 'conv-1',
        totalCostUsd: 0.42,
        sessionId: 'sess-1',
        numTurns: 3,
        durationMs: 5000,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('LLM spend alert'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('user-1'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('$25.00'),
      );
    });

    it('does NOT log warn when month-to-date sum is below threshold (mock aggregate $15, threshold $20)', async () => {
      mockPrisma.costRecord.aggregate.mockResolvedValue({ _sum: { costUsd: 15 } });
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      await service.recordCost({
        userId: 'user-1',
        conversationId: 'conv-1',
        totalCostUsd: 0.42,
        sessionId: 'sess-1',
        numTurns: 3,
        durationMs: 5000,
      });

      const budgetWarnCalls = warnSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('LLM spend alert'),
      );
      expect(budgetWarnCalls).toHaveLength(0);
    });

    it('does NOT throw when checkBudgetAlert fails (aggregate rejects) — cost record already inserted, alert failure logged via logger.warn and swallowed', async () => {
      mockPrisma.costRecord.aggregate.mockRejectedValue(new Error('aggregate query failed'));
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      await expect(
        service.recordCost({
          userId: 'user-1',
          conversationId: 'conv-1',
          totalCostUsd: 0.42,
          sessionId: 'sess-1',
          numTurns: 3,
          durationMs: 5000,
        }),
      ).resolves.toBeUndefined();

      expect(mockPrisma.costRecord.create).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check budget alert for user user-1'),
      );
    });
  });

  describe('[P1] AC-2 — SPEND_ALERT_THRESHOLD_USD env var', () => {
    it('reads LLM_SPEND_ALERT_THRESHOLD_USD from process.env when set', async () => {
      const originalEnv = process.env.LLM_SPEND_ALERT_THRESHOLD_USD;
      process.env.LLM_SPEND_ALERT_THRESHOLD_USD = '50';

      try {
        let serviceWithCustomThreshold: CostTrackingService;
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mod = require('./cost-tracking.service');
          serviceWithCustomThreshold = new mod.CostTrackingService(mockPrisma);
        });

        mockPrisma.costRecord.aggregate.mockResolvedValue({ _sum: { costUsd: 30 } });
        const warnSpy = jest.spyOn(serviceWithCustomThreshold!['logger'], 'warn').mockImplementation(() => undefined);

        await serviceWithCustomThreshold!.recordCost({
          userId: 'user-1',
          conversationId: 'conv-1',
          totalCostUsd: 0.42,
          sessionId: 'sess-1',
          numTurns: 3,
          durationMs: 5000,
        });

        const budgetWarnCalls = warnSpy.mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].includes('LLM spend alert'),
        );
        expect(budgetWarnCalls).toHaveLength(0);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.LLM_SPEND_ALERT_THRESHOLD_USD;
        } else {
          process.env.LLM_SPEND_ALERT_THRESHOLD_USD = originalEnv;
        }
      }
    });

    it('falls back to 20 when LLM_SPEND_ALERT_THRESHOLD_USD is unset or invalid (parseFloat("not-a-number") → NaN → fallback)', async () => {
      const originalEnv = process.env.LLM_SPEND_ALERT_THRESHOLD_USD;
      process.env.LLM_SPEND_ALERT_THRESHOLD_USD = 'not-a-number';

      try {
        let serviceWithInvalidThreshold: CostTrackingService;
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mod = require('./cost-tracking.service');
          serviceWithInvalidThreshold = new mod.CostTrackingService(mockPrisma);
        });

        mockPrisma.costRecord.aggregate.mockResolvedValue({ _sum: { costUsd: 25 } });
        const warnSpy = jest.spyOn(serviceWithInvalidThreshold!['logger'], 'warn').mockImplementation(() => undefined);

        await serviceWithInvalidThreshold!.recordCost({
          userId: 'user-1',
          conversationId: 'conv-1',
          totalCostUsd: 0.42,
          sessionId: 'sess-1',
          numTurns: 3,
          durationMs: 5000,
        });

        const budgetWarnCalls = warnSpy.mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].includes('LLM spend alert'),
        );
        expect(budgetWarnCalls).toHaveLength(1);
        expect(budgetWarnCalls[0][0]).toContain('$20.00');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.LLM_SPEND_ALERT_THRESHOLD_USD;
        } else {
          process.env.LLM_SPEND_ALERT_THRESHOLD_USD = originalEnv;
        }
      }
    });
  });
});
