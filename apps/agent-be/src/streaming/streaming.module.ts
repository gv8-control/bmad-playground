import { Module } from '@nestjs/common';
import { StreamingController } from './streaming.controller';
import { SessionEventsService } from './session-events.service';
import { AgentService } from './agent.service';
import { AGENT_SERVICE } from '@bmad-easy/shared-types';

@Module({
  providers: [
    SessionEventsService,
    { provide: AGENT_SERVICE, useClass: AgentService },
  ],
  controllers: [StreamingController],
  exports: [SessionEventsService, AGENT_SERVICE],
})
export class StreamingModule {}
