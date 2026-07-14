import { Module } from '@nestjs/common';
import { AnthropicProxyController } from './anthropic-proxy.controller';

@Module({
  controllers: [AnthropicProxyController],
})
export class AnthropicProxyModule {}
