import { Module } from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { EncryptionService } from './encryption.service';

@Module({
  providers: [CredentialsService, EncryptionService],
  exports: [CredentialsService, EncryptionService],
})
export class CredentialsModule {}
