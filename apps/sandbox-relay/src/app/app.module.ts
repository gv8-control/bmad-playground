import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProxyModule } from '../proxy/proxy.module';
import { HealthModule } from '../health/health.module';
import { TunnelModule } from '../tunnel/tunnel.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ProxyModule, HealthModule, TunnelModule],
})
export class AppModule {}
