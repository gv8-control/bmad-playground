import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { ManualCommitService } from './manual-commit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { StreamingModule } from '../streaming/streaming.module';
import { ProvisionQueueService } from '../sandbox/provision-queue.service';
import { IdleTimeoutService } from '../sandbox/idle-timeout.service';

@Module({
  imports: [PrismaModule, SandboxModule, CredentialsModule, StreamingModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ManualCommitService, ProvisionQueueService, IdleTimeoutService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
