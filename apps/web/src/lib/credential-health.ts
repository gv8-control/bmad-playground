import { getPrisma } from './prisma';
import { decryptToken, KekConfigurationError } from './crypto';
import type { CredentialHealthStatus } from '@bmad-easy/shared-types';

/** Thrown when a git/GitHub API operation returns HTTP 401 or 403. */
export class CredentialFailureError extends Error {
  constructor(public readonly statusCode: number, options?: { cause?: unknown }) {
    super(`Credential failure: GitHub API returned ${statusCode}`, options);
    this.name = 'CredentialFailureError';
  }
}

/**
 * Tenant-scoped OAuth token resolution (NFR-S2).
 *
 * This is the SINGLE point where plaintext OAuth tokens are resolved.
 * The `where: { userId }` clause IS the tenant authorization check —
 * tokens are never resolved across users.
 *
 * @throws {CredentialFailureError} if no OAuthCredential exists for the user, or if
 * decryptToken fails for a per-row reason (tampered credential, or a pre-AAD-binding
 * legacy row) — both mean the same thing to callers: no usable token, user must
 * re-authenticate.
 * @throws {KekConfigurationError} if `CREDENTIAL_ENCRYPTION_KEK` itself is missing or
 * malformed — an ops/deployment problem, not a per-user credential problem. Re-thrown
 * as-is so callers don't mistake a bad deploy for an individual invalid credential.
 */
export async function resolveOAuthToken(userId: string): Promise<string> {
  const credential = await getPrisma().oAuthCredential.findUnique({
    where: { userId },
  });
  if (!credential) {
    throw new CredentialFailureError(401);
  }
  try {
    return decryptToken(credential, userId);
  } catch (err) {
    if (err instanceof KekConfigurationError) {
      console.error(`[resolveOAuthToken] KEK configuration error:`, err);
      throw err;
    }
    console.error(`[resolveOAuthToken] decryptToken failed for userId ${userId}:`, err);
    throw new CredentialFailureError(401, { cause: err });
  }
}

/**
 * Mark a user's repository connection credential health as `failed`.
 * Called when a git/GitHub API operation returns 401/403 (NFR-R1).
 * No-op if no RepoConnection exists (first sign-in before connection).
 *
 * @param capturedAt Optional optimistic-concurrency guard — a timestamp captured
 * before the GitHub call that triggered this failure (e.g. right before
 * `resolveOAuthToken`). When provided, the write only applies if the row's
 * `updatedAt` is strictly before this time, so a `failed` write can never
 * clobber a concurrent re-authorization (which bumps `updatedAt` to `healthy`)
 * that happened after the request started. When omitted, the update is
 * unconditional (fallback for callers with no natural timestamp to pass).
 */
export async function markCredentialFailed(userId: string, capturedAt?: Date): Promise<void> {
  try {
    await getPrisma().repoConnection.updateMany({
      where: capturedAt ? { userId, updatedAt: { lt: capturedAt } } : { userId },
      data: { credentialHealth: 'failed' },
    });
  } catch (err) {
    console.error('[markCredentialFailed] Failed to update credential health:', err);
  }
}

/**
 * Mark a user's repository connection credential health as `healthy`.
 * Called after successful re-authorization (AC-3).
 * No-op if no RepoConnection exists.
 */
export async function markCredentialHealthy(userId: string): Promise<void> {
  await getPrisma().repoConnection.updateMany({
    where: { userId },
    data: { credentialHealth: 'healthy' },
  });
}

/**
 * Read a user's current credential health status.
 * @returns `null` if no RepoConnection exists
 */
export async function getCredentialHealth(
  userId: string,
): Promise<CredentialHealthStatus | null> {
  const conn = await getPrisma().repoConnection.findUnique({
    where: { userId },
    select: { credentialHealth: true },
  });
  return (conn?.credentialHealth as CredentialHealthStatus | null) ?? null;
}
