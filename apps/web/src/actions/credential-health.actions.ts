'use server';

import { auth, signIn } from '@/lib/auth';
import { getCredentialHealth } from '@/lib/credential-health';
import type { CredentialHealthStatus } from '@bmad-easy/shared-types';

export type GetCredentialHealthResult =
  | { success: true; status: CredentialHealthStatus }
  | { success: false; error: string };

/**
 * Returns the current credential health status for the authenticated user.
 * Called by Epic 2's Project Map / Artifact Browser to decide whether to
 * show the Credential Error Banner (UX-DR10).
 */
export async function getCredentialHealthStatus(): Promise<GetCredentialHealthResult> {
  const session = await auth();
  if (!session?.userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const health = await getCredentialHealth(session.userId);
    if (health === null) {
      return { success: true, status: 'healthy' as CredentialHealthStatus };
    }
    return { success: true, status: health };
  } catch (err) {
    console.error('[getCredentialHealthStatus] Unexpected error:', err);
    return { success: false, error: 'Failed to check credential health' };
  }
}

/**
 * Initiates GitHub OAuth re-authorization without disconnecting the repository.
 *
 * Calls `signIn('github')` which redirects to GitHub's OAuth flow. On success,
 * the jwt callback in auth.ts stores the new encrypted token AND resets
 * RepoConnection.credentialHealth to 'healthy' (AC-3).
 *
 * @param callbackUrl - URL to redirect to after successful re-auth (default: current page)
 */
export async function reauthorizeGitHub(callbackUrl?: string): Promise<void> {
  await signIn('github', { redirectTo: callbackUrl });
}
