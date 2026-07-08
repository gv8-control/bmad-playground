import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService, KekConfigurationError } from './encryption.service';

export class CredentialFailureError extends Error {
  constructor(public readonly statusCode: number, options?: { cause?: unknown }) {
    super(`Credential failure: token resolution returned ${statusCode}`, options);
    this.name = 'CredentialFailureError';
  }
}

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async resolveOAuthToken(userId: string): Promise<string> {
    const credential = await this.prisma.oAuthCredential.findUnique({
      where: { userId },
    });

    if (!credential) {
      throw new CredentialFailureError(401);
    }

    try {
      return this.encryptionService.decryptToken(
        {
          encryptedDek: credential.encryptedDek,
          dekNonce: credential.dekNonce,
          encryptedToken: credential.encryptedToken,
          tokenNonce: credential.tokenNonce,
          kekId: credential.kekId,
        },
        userId,
      );
    } catch (err) {
      if (err instanceof KekConfigurationError) {
        this.logger.error(`KEK configuration error: ${err.message}`);
        throw err;
      }
      this.logger.error(`decryptToken failed for userId ${userId}`);
      throw new CredentialFailureError(401, { cause: err });
    }
  }

  async isCredentialHealthFailed(userId: string): Promise<boolean> {
    try {
      const repoConnection = await this.prisma.repoConnection.findUnique({
        where: { userId },
        select: { credentialHealth: true },
      });
      return repoConnection?.credentialHealth === 'failed';
    } catch (err) {
      this.logger.error(
        `Failed to check credential health for userId ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  async markCredentialFailed(userId: string, capturedAt?: Date): Promise<void> {
    try {
      await this.prisma.repoConnection.updateMany({
        where: capturedAt
          ? { userId, updatedAt: { lt: capturedAt } }
          : { userId },
        data: { credentialHealth: 'failed' },
      });
    } catch (err) {
      this.logger.error(
        `Failed to update credential health for userId ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
