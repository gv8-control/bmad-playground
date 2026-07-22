import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Health endpoint at `/health` — not behind the relay auth guard, so Railway's
 * healthcheck can reach it without a token. Returns 200 `{ status: 'ok' }`.
 */
@Controller('health')
export class HealthController {
  @Get()
  health(@Res() res: Response): void {
    res.status(200).json({ status: 'ok' });
  }
}
