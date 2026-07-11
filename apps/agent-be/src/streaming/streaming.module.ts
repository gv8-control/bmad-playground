import { Module } from '@nestjs/common';
import { StreamingController } from './streaming.controller';
import { SessionEventsService } from './session-events.service';
import { AgentService } from './agent.service';
import { ToolPillClassifierService } from './tool-pill-classifier.service';
import { CredentialsModule } from '../credentials/credentials.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { CostTrackingModule } from '../cost-tracking/cost-tracking.module';
import { AGENT_SERVICE } from '@bmad-easy/shared-types';

@Module({
  imports: [CredentialsModule, SandboxModule, CostTrackingModule],
  providers: [
    SessionEventsService,
    ToolPillClassifierService,
    { provide: AGENT_SERVICE, useClass: AgentService },
  ],
  controllers: [StreamingController],
  exports: [SessionEventsService, AGENT_SERVICE, ToolPillClassifierService],
})
export class StreamingModule {}
