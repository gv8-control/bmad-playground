/**
 * @jest-environment node
 *
 * Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation
 * Unit tests for CredentialsService.markCredentialFailed (agent-be).
 *
 * Covers AC-1: 401 detection persists failed credential health.
 * Verifies the optimistic-concurrency guard (capturedAt) and that failures
 * are logged and swallowed (do not crash the classifier).
 */
import { CredentialsService } from './credentials.service';

describe('CredentialsService.markCredentialFailed (agent-be)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEncryptionService: any;
  let service: CredentialsService;

  beforeEach(() => {
    mockPrisma = {
      repoConnection: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      oAuthCredential: {
        findUnique: jest.fn(),
      },
    };
    mockEncryptionService = {
      decryptToken: jest.fn(),
    };
    service = new CredentialsService(mockPrisma, mockEncryptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('[P0] calls prisma.repoConnection.updateMany with { where: { userId }, data: { credentialHealth: "failed" } }', async () => {
    await service.markCredentialFailed('user-1');

    expect(mockPrisma.repoConnection.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { credentialHealth: 'failed' },
    });
  });

  it('[P0] with capturedAt adds updatedAt: { lt: capturedAt } to the where clause (optimistic-concurrency guard)', async () => {
    const capturedAt = new Date('2026-07-05T00:00:00.000Z');

    await service.markCredentialFailed('user-1', capturedAt);

    expect(mockPrisma.repoConnection.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', updatedAt: { lt: capturedAt } },
      data: { credentialHealth: 'failed' },
    });
  });

  it('[P0] does NOT throw when updateMany fails — logs via logger.error and swallows', async () => {
    mockPrisma.repoConnection.updateMany.mockRejectedValue(new Error('DB connection lost'));
    const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    await expect(service.markCredentialFailed('user-1')).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update credential health for userId user-1'),
    );
  });

  it('[P0] is a no-op (no throw) when no RepoConnection exists (updateMany updates 0 rows)', async () => {
    mockPrisma.repoConnection.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markCredentialFailed('user-1')).resolves.toBeUndefined();
  });
});

describe('CredentialsService.isCredentialHealthFailed (agent-be)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEncryptionService: any;
  let service: CredentialsService;

  beforeEach(() => {
    mockPrisma = {
      repoConnection: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      oAuthCredential: {
        findUnique: jest.fn(),
      },
    };
    mockEncryptionService = {
      decryptToken: jest.fn(),
    };
    service = new CredentialsService(mockPrisma, mockEncryptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('[P0] returns true when credentialHealth is "failed"', async () => {
    mockPrisma.repoConnection.findUnique.mockResolvedValue({ credentialHealth: 'failed' });

    await expect(service.isCredentialHealthFailed('user-1')).resolves.toBe(true);
  });

  it('[P0] returns false when credentialHealth is "healthy"', async () => {
    mockPrisma.repoConnection.findUnique.mockResolvedValue({ credentialHealth: 'healthy' });

    await expect(service.isCredentialHealthFailed('user-1')).resolves.toBe(false);
  });

  it('[P0] returns false when no RepoConnection exists (findUnique returns null)', async () => {
    mockPrisma.repoConnection.findUnique.mockResolvedValue(null);

    await expect(service.isCredentialHealthFailed('user-1')).resolves.toBe(false);
  });

  it('[P0] returns false and logs when findUnique throws (DB read failure does not block provisioning)', async () => {
    mockPrisma.repoConnection.findUnique.mockRejectedValue(new Error('DB connection lost'));
    const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    await expect(service.isCredentialHealthFailed('user-1')).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to check credential health for userId user-1'),
    );
  });

  it('[P0] queries with { where: { userId }, select: { credentialHealth: true } }', async () => {
    mockPrisma.repoConnection.findUnique.mockResolvedValue({ credentialHealth: 'healthy' });

    await service.isCredentialHealthFailed('user-1');

    expect(mockPrisma.repoConnection.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { credentialHealth: true },
    });
  });
});
