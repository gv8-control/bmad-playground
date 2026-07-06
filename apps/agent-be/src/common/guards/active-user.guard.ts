import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { UserContext } from '../types/user-context.type';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.userId;

    if (!userId) {
      throw new ForbiddenException('No userId on request — BoundaryJwtGuard must run first');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        githubLogin: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    const userContext: UserContext = {
      id: user.id,
      githubLogin: user.githubLogin,
      name: user.name,
      email: user.email,
      active: true,
    };

    request.user = userContext;
    return true;
  }
}
