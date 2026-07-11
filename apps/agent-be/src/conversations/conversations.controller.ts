import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { ConversationsService } from './conversations.service';
import { User } from '../common/decorators/user.decorator';
import type { UserContext } from '../common/types/user-context.type';
import type { SkillInfo } from '@bmad-easy/shared-types';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ResumeConversationDto } from './dto/resume-conversation.dto';
import { SaveConversationDto } from './dto/save-conversation.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async createConversation(
    @User() user: UserContext,
    @Body(new ZodValidationPipe()) _body: CreateConversationDto,
  ): Promise<{ id: string }> {
    return this.conversationsService.createConversation(user.id);
  }

  @Get(':id/status')
  async getStatus(
    @Param('id') id: string,
    @User() user: UserContext,
  ): Promise<{
    conversationId: string;
    sandboxStatus: 'provisioning' | 'ready' | 'failed' | 'idle-timeout';
  }> {
    return this.conversationsService.getStatus(id, user.id);
  }

  @Get(':id/skills')
  async listSkills(
    @Param('id') id: string,
    @User() user: UserContext,
  ): Promise<SkillInfo[]> {
    return this.conversationsService.listSkills(id, user.id);
  }

  @Post(':id/turns')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async sendTurn(
    @Param('id') id: string,
    @User() user: UserContext,
    @Body(new ZodValidationPipe()) body: SendMessageDto,
  ): Promise<{ conversationId: string; title: string | null }> {
    return this.conversationsService.sendTurn(id, user.id, body.content);
  }

  @Post(':id/stop')
  async stopAgent(
    @Param('id') id: string,
    @User() user: UserContext,
  ): Promise<{ conversationId: string; stopped: boolean }> {
    return this.conversationsService.stopAgent(id, user.id);
  }

  @Post(':id/resume')
  async resumeConversation(
    @Param('id') id: string,
    @User() user: UserContext,
    @Body(new ZodValidationPipe()) _body: ResumeConversationDto,
  ): Promise<{
    conversationId: string;
    sandboxStatus: 'provisioning' | 'ready' | 'failed' | 'idle-timeout';
  }> {
    return this.conversationsService.resumeConversation(id, user.id);
  }

  @Post(':id/save')
  async saveConversation(
    @Param('id') id: string,
    @User() user: UserContext,
    @Body(new ZodValidationPipe()) _body: SaveConversationDto,
  ): Promise<{ committed: boolean; clean: boolean; queued: boolean }> {
    return this.conversationsService.manualCommit(id, user.id);
  }

  @Delete(':id')
  async abandonConversation(
    @Param('id') id: string,
    @User() user: UserContext,
  ): Promise<{ conversationId: string; abandoned: boolean }> {
    return this.conversationsService.abandonConversation(id, user.id);
  }
}
