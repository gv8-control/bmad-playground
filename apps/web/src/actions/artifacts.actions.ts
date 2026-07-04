'use server';

import { auth } from '@/lib/auth';
import {
  CredentialFailureError,
  resolveOAuthToken,
  markCredentialFailed,
} from '@/lib/credential-health';
import { RateLimitError, rateLimitMessage } from '@/lib/repository-validation';
import { getPrisma } from '@/lib/prisma';
import { syncArtifacts } from '@/lib/artifacts';
import type { SyncArtifactsResult } from '@bmad-easy/shared-types';

const SYNC_COOLDOWN_MS = 30_000;

export async function syncArtifactsAction(): Promise<SyncArtifactsResult> {
  const session = await auth();
  if (!session?.userId) {
    return { error: 'Not authenticated', errorCode: 'NO_CREDENTIAL' };
  }

  const repoConnection = await getPrisma().repoConnection.findUnique({
    where: { userId: session.userId },
  });

  if (!repoConnection) {
    return { error: 'No repository connection found', errorCode: 'NO_REPO_CONNECTION' };
  }

  const now = new Date();
  const cooldownThreshold = new Date(now.getTime() - SYNC_COOLDOWN_MS);

  const cooldownUpdate = await getPrisma().repoConnection.updateMany({
    where: {
      id: repoConnection.id,
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cooldownThreshold } }],
    },
    data: { lastSyncedAt: now },
  });

  if (cooldownUpdate.count === 0) {
    return {
      error: 'Please wait at least 30 seconds between refreshes.',
      errorCode: 'RATE_LIMITED',
    };
  }

  const cleanUrl = repoConnection.repoUrl.replace(/\.git\/?$/, '').replace(/\/$/, '');
  const match = cleanUrl.match(/^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/);
  if (!match) {
    return { error: 'Invalid repository URL', errorCode: 'UNKNOWN' };
  }
  const [, owner, repo] = match;

  const capturedAt = new Date();
  let accessToken: string;
  try {
    accessToken = await resolveOAuthToken(session.userId);
  } catch (err) {
    if (err instanceof CredentialFailureError) {
      await markCredentialFailed(session.userId, capturedAt).catch((markErr) =>
        console.error('[syncArtifactsAction] markCredentialFailed failed:', markErr),
      );
      return {
        error: 'Your GitHub credential is missing or invalid. Please sign out and sign in again.',
        errorCode: 'NO_CREDENTIAL',
      };
    }
    console.error('[syncArtifactsAction] Credential resolution failed:', err);
    return {
      error: 'An unexpected error occurred during artifact sync. Please try again.',
      errorCode: 'UNKNOWN',
    };
  }

  try {
    return await syncArtifacts(accessToken, owner, repo, repoConnection.id);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: rateLimitMessage(err), errorCode: 'RATE_LIMITED' };
    }
    if (err instanceof CredentialFailureError) {
      await markCredentialFailed(session.userId, capturedAt).catch((markErr) =>
        console.error('[syncArtifactsAction] markCredentialFailed failed:', markErr),
      );
      return {
        error: 'Your GitHub access token has expired or been revoked. Please sign out and sign in again.',
        errorCode: 'NO_CREDENTIAL',
      };
    }
    console.error('[syncArtifactsAction] Unexpected error:', err);
    return {
      error: 'An unexpected error occurred during artifact sync. Please try again.',
      errorCode: 'UNKNOWN',
    };
  }
}
