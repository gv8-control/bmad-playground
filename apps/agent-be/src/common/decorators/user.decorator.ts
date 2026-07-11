import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { UserContext } from '../types/user-context.type';

export const User = createParamDecorator(
  (data: keyof UserContext | undefined, ctx: ExecutionContext): UserContext | unknown => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return data ? (user as UserContext)[data] : user;
  },
);
