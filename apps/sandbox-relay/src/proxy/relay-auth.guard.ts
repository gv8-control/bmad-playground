import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

const logger = new Logger('RelayAuthGuard');

// Warn once at module load if the token is unset. The actual check reads the
// env var at call time so tests (and runtime env changes) are respected.
if (!process.env.RELAY_AUTH_TOKEN) {
  logger.warn(
    'RELAY_AUTH_TOKEN is not set — relay auth guard is disabled (dev mode). Set it in production.',
  );
}

@Injectable()
export class RelayAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedToken = process.env.RELAY_AUTH_TOKEN;
    if (!expectedToken) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-relay-token'];
    if (!token || token !== expectedToken) {
      throw new UnauthorizedException('Invalid or missing relay token');
    }
    return true;
  }
}
