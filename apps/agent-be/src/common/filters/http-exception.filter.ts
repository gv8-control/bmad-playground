import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorEnvelope {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let envelope: ErrorEnvelope;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        envelope = { code: exception.name, message: res };
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        envelope = {
          code: (r.code as string) ?? exception.name,
          message: (r.message as string) ?? exception.message,
          ...(r.meta ? { meta: r.meta as Record<string, unknown> } : {}),
        };
      } else {
        envelope = { code: exception.name, message: exception.message };
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      envelope = {
        code: 'InternalServerError',
        message: 'An unexpected error occurred',
      };
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      envelope = {
        code: 'InternalServerError',
        message: 'An unexpected error occurred',
      };
    }

    const statusCode = status ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const logEntry: Record<string, unknown> = {
      level: 'error',
      statusCode,
      path: this.sanitizePath(request.url),
      method: request.method,
      code: envelope.code,
      message: envelope.message,
    };
    if (!(exception instanceof HttpException)) {
      logEntry.errorName = exception instanceof Error ? exception.name : 'unknown';
      logEntry.errorMessage = exception instanceof Error ? exception.message : String(exception);
    }
    this.logger.error(JSON.stringify(logEntry));

    response.status(statusCode).json(envelope);
  }

  private sanitizePath(url: string): string {
    return url.replace(/([?&])token=[^&]*/gi, '$1token=[redacted]');
  }
}
