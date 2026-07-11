import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface JwtPayload {
  userId: string;
  iat: number;
  exp?: number;
}

declare module 'express' {
  interface Request {
    userId?: string;
    user?: import('../types/user-context.type').UserContext;
  }
}

@Injectable()
export class BoundaryJwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (typeof request.query.token === 'string') {
      token = request.query.token;
    }

    if (!token) {
      throw new UnauthorizedException('Missing boundary JWT');
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new UnauthorizedException('AUTH_SECRET is not configured');
    }

    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
        { issuer: 'bmad-easy:boundary', audience: 'bmad-easy:agent-be' },
      );
      const jwtPayload = payload as unknown as JwtPayload;
      if (!jwtPayload.userId) {
        throw new UnauthorizedException('Invalid boundary JWT payload');
      }
      request.userId = jwtPayload.userId;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired boundary JWT');
    }
  }
}
