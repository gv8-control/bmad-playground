'use server';

import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import {
  resolveOAuthToken,
  markCredentialFailed,
  CredentialFailureError,
} from '@/lib/credential-health';
import {
  inspectBmadSetup,
  invalidateValidationCache,
  detectGithubRateLimit,
  rateLimitMessage,
  RateLimitError,
} from '@/lib/repository-validation';
import { z } from 'zod';

const connectRepoSchema = z.object({
  repoUrl: z
    .string()
    .url('Must be a valid URL')
    .regex(
      /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?\/?$/,
      'Must be a GitHub repository URL (e.g. https://github.com/owner/repo)',
    ),
});

type ConnectResult =
  | { success: true }
  | {
      error: string;
      errorCode:
        | 'INVALID_URL'
        | 'NOT_FOUND'
        | 'INSUFFICIENT_PERMISSION'
        | 'ORG_RESTRICTION'
        | 'RATE_LIMITED'
        | 'NO_CREDENTIAL'
        | 'UNKNOWN'
        | 'MISSING_DIRECTORY'
        | 'NO_SKILLS_FOUND'
        | 'UNSUPPORTED_VERSION';
      documentationLink?: string;
    };

export async function connectRepository(repoUrl: string): Promise<ConnectResult> {
  if (typeof repoUrl !== 'string') {
    return {
      error: 'Must be a GitHub repository URL (e.g. https://github.com/owner/repo)',
      errorCode: 'INVALID_URL',
    };
  }

  const parsed = connectRepoSchema.safeParse({ repoUrl: repoUrl.trim() });
  if (!parsed.success) {
    return {
      error: 'Must be a GitHub repository URL (e.g. https://github.com/owner/repo)',
      errorCode: 'INVALID_URL',
    };
  }
  const cleanUrl = parsed.data.repoUrl.replace(/\.git\/?$/, '').replace(/\/$/, '');

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
        console.error('[connectRepository] markCredentialFailed failed:', markErr),
      );
      return {
        error: 'Your GitHub credential is missing or invalid. Please sign out and sign in again.',
        errorCode: 'NO_CREDENTIAL',
      };
    }
    console.error('[connectRepository] Credential resolution failed:', err);
    return { error: 'An unexpected error occurred. Please try again.', errorCode: 'UNKNOWN' };
  }

  try {
    const match = cleanUrl.match(/^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/);
    if (!match) {
      return { error: 'Invalid GitHub repository URL format', errorCode: 'INVALID_URL' };
    }
    const [, owner, repo] = match;
    if (/^\.{1,2}$/.test(owner) || /^\.{1,2}$/.test(repo)) {
      return { error: 'Invalid GitHub repository URL format', errorCode: 'INVALID_URL' };
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 401) {
      await markCredentialFailed(session.userId, capturedAt);
      return {
        error: 'Your GitHub access token has expired or been revoked. Please sign out and sign in again.',
        errorCode: 'NO_CREDENTIAL',
      };
    }

    if (response.status === 404) {
      return {
        error: 'Repository not found. Check that the URL is correct and you have access to it.',
        errorCode: 'NOT_FOUND',
      };
    }

    if (response.status === 403) {
      const body = await response.json().catch(() => ({}));
      const rateLimit = detectGithubRateLimit(response, body);
      if (rateLimit) {
        return { error: rateLimitMessage(rateLimit), errorCode: 'RATE_LIMITED' };
      }

      const message: string = body?.message ?? '';
      const isOrgRestriction =
        message.toLowerCase().includes('organization') &&
        (message.toLowerCase().includes('oauth') ||
          message.toLowerCase().includes('application') ||
          message.toLowerCase().includes('access'));
      if (isOrgRestriction) {
        return {
          error:
            "Your GitHub organization has OAuth App access restrictions enabled. Ask an org admin to approve bmad-easy in the organization's OAuth App settings.",
          errorCode: 'ORG_RESTRICTION',
        };
      }
      return {
        error: 'Access denied. You may not have permission to access this repository.',
        errorCode: 'INSUFFICIENT_PERMISSION',
      };
    }

    if (!response.ok) {
      return {
        error: `GitHub returned an unexpected error (${response.status}). Try again.`,
        errorCode: 'UNKNOWN',
      };
    }

    const data = await response.json();

    if (!data.permissions?.push) {
      return {
        error:
          "You don't have write access to this repository. bmad-easy requires write access to create and update BMAD artifacts.",
        errorCode: 'INSUFFICIENT_PERMISSION',
      };
    }

    let validation;
    try {
      validation = await inspectBmadSetup(accessToken, owner, repo);
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
    if ('code' in validation) {
      console.info(
        '[repository:validation] %s for %s/%s during connect',
        validation.code,
        owner,
        repo,
      );
      return {
        error: validation.message,
        errorCode: validation.code,
        documentationLink: validation.meta.documentationLink,
      };
    }

    await getPrisma().repoConnection.upsert({
      where: { userId: session.userId },
      update: {
        repoUrl: cleanUrl,
        credentialHealth: 'healthy',
      },
      create: {
        userId: session.userId,
        repoUrl: cleanUrl,
        credentialHealth: 'healthy',
      },
    });

    invalidateValidationCache(session.userId, cleanUrl);

    return { success: true };
  } catch (err) {
    console.error('[connectRepository] Unexpected error:', err);
    return { error: 'An unexpected error occurred. Please try again.', errorCode: 'UNKNOWN' };
  }
}
