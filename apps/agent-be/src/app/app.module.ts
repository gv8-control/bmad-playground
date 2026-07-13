import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import configuration from '../config/configuration';
import { validateEnv } from '../config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { BoundaryJwtGuard } from '../common/guards/boundary-jwt.guard';
import { ActiveUserGuard } from '../common/guards/active-user.guard';
import { ConversationsModule } from '../conversations/conversations.module';
import { StreamingModule } from '../streaming/streaming.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { AnthropicProxyModule } from '../anthropic-proxy/anthropic-proxy.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 100 },
    ]),
    PrismaModule,
    CredentialsModule,
    SandboxModule,
    StreamingModule,
    AnthropicProxyModule,
    ConversationsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: BoundaryJwtGuard },
    { provide: APP_GUARD, useClass: ActiveUserGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
