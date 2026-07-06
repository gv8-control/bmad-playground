import { Module } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { daytonaClientProvider } from './daytona-client.provider';
import { SANDBOX_SERVICE } from '@bmad-easy/shared-types';

@Module({
  providers: [
    daytonaClientProvider,
    { provide: SANDBOX_SERVICE, useClass: SandboxService },
  ],
  exports: [SANDBOX_SERVICE],
})
export class SandboxModule {}
