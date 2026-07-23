import { Module } from '@nestjs/common';
import { TunnelGateway } from './tunnel.gateway';

@Module({
  providers: [TunnelGateway],
})
export class TunnelModule {}
