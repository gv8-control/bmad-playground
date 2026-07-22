import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller';
import { RelayAuthGuard } from './relay-auth.guard';

@Module({
  controllers: [ProxyController],
  providers: [RelayAuthGuard],
})
export class ProxyModule {}
