import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SPEND_ALERT_THRESHOLD_USD = (() => {
  const parsed = parseFloat(process.env.LLM_SPEND_ALERT_THRESHOLD_USD ?? '20');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
})();

@Injectable()
export class CostTrackingService {
  private readonly logger = new Logger(CostTrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordCost(params: {
    userId: string;
    conversationId: string;
    totalCostUsd: number;
    sessionId: string;
    numTurns: number;
    durationMs: number;
  }): Promise<void> {
    try {
      await this.prisma.costRecord.create({
        data: {
          userId: params.userId,
          conversationId: params.conversationId,
          costUsd: params.totalCostUsd,
          sessionId: params.sessionId,
          numTurns: params.numTurns,
          durationMs: params.durationMs,
        },
      });

      await this.checkBudgetAlert(params.userId);
    } catch (err) {
      this.logger.error(
        `Failed to record cost for user ${params.userId} (conversation ${params.conversationId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async checkBudgetAlert(userId: string): Promise<void> {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      const result = await this.prisma.costRecord.aggregate({
        where: {
          userId,
          createdAt: { gte: monthStart },
        },
        _sum: { costUsd: true },
      });

      const monthToDate = result._sum.costUsd ?? 0;
      if (monthToDate > SPEND_ALERT_THRESHOLD_USD) {
        this.logger.warn(
          `LLM spend alert: user ${userId} has spent $${monthToDate.toFixed(2)} this month (threshold $${SPEND_ALERT_THRESHOLD_USD.toFixed(2)})`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to check budget alert for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
