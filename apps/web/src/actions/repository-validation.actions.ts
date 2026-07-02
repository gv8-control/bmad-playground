'use server';

import { auth } from '@/lib/auth';
import {
  CredentialFailureError,
  resolveOAuthToken,
  markCredentialFailed,
  getCredentialHealth,
} from '@/lib/credential-health';
import {
  inspectBmadSetup,
  getCachedValidation,
  cacheValidation,
  RateLimitError,
  rateLimitMessage,
} from '@/lib/repository-validation';
import { z } from 'zod';
import type { ValidationError, ValidationResult } from '@bmad-easy/shared-types';

const repoUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .regex(
    /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?\/?$/,
    'Must be a GitHub repository URL (e.g. https://github.com/owner/repo)',
  );

type ActionError = {
  errorCode: 'INVALID_URL' | 'NO_CREDENTIAL' | 'RATE_LIMITED' | 'UNKNOWN';
  error: string;
};

type ValidateRepositoryActionResult =
  | ValidationResult
  | ValidationError
  | ActionError;

const INVALID_URL_RESULT: ActionError = {
  error: 'Must be a GitHub repository URL (e.g. https://github.com/owner/repo)',
  errorCode: 'INVALID_URL',
};

export async function validateRepository(
  repoUrl: string,
): Promise<ValidateRepositoryActionResult> {
  if (typeof repoUrl !== 'string') {
    return INVALID_URL_RESULT;
  }

  const parsed = repoUrlSchema.safeParse(repoUrl.trim());
  if (!parsed.success) {
    return INVALID_URL_RESULT;
  }
  const cleanUrl = parsed.data.replace(/\.git\/?$/, '').replace(/\/$/, '');

  const session = await auth();
  if (!session?.userId) {
    return { error: 'Not authenticated', errorCode: 'UNKNOWN' };
  }

  const capturedAt = new Date();
  let accessToken: string;
  try {
    accessToken = await resolveOAuthToken(session.userId);
  } catch (err) {
    if (err instanceof CredentialFailureError) {
      await markCredentialFailed(session.userId, capturedAt).catch((markErr) =>
        console.error('[validateRepository] markCredentialFailed failed:', markErr),
      );
      return {
        error: 'Your GitHub credential is missing or invalid. Please sign out and sign in again.',
        errorCode: 'NO_CREDENTIAL',
      };
    }
    console.error('[validateRepository] Credential resolution failed:', err);
    return {
      error: 'An unexpected error occurred during validation. Please try again.',
      errorCode: 'UNKNOWN',
    };
  }

  try {
    const match = cleanUrl.match(/^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/);
    if (!match) {
      return {
        error: 'Invalid GitHub repository URL format',
        errorCode: 'INVALID_URL',
      };
    }
    const [, owner, repo] = match;
    if (/^\.{1,2}$/.test(owner) || /^\.{1,2}$/.test(repo)) {
      return INVALID_URL_RESULT;
    }

    const cached = getCachedValidation(session.userId, owner, repo);
    if (cached) {
      const health = await getCredentialHealth(session.userId);
      if (health !== 'failed') return cached;
    }

    try {
      const result = await inspectBmadSetup(accessToken, owner, repo);
      if ('valid' in result) {
        cacheValidation(session.userId, owner, repo, result);
      }
      return result;
    } catch (err) {
      if (err instanceof RateLimitError) {
        return { error: rateLimitMessage(err), errorCode: 'RATE_LIMITED' };
      }
      if (err instanceof CredentialFailureError) {
        await markCredentialFailed(session.userId, capturedAt);
        return {
          error: 'Your GitHub access token has expired or been revoked. Please sign out and sign in again.',
          errorCode: 'NO_CREDENTIAL',
        };
      }
      throw err;
    }
  } catch (err) {
    console.error('[validateRepository] Unexpected error:', err);
    return {
      error: 'An unexpected error occurred during validation. Please try again.',
      errorCode: 'UNKNOWN',
    };
  }
}
