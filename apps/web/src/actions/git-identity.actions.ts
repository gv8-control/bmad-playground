'use server';

import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { resolveGitIdentity } from '@/lib/git-identity';
import type { GitUserConfig } from '@bmad-easy/shared-types';

export type GetGitIdentityResult =
  | (GitUserConfig & { success: true })
  | { success: false; error: string };

export async function getGitIdentity(): Promise<GetGitIdentityResult> {
  const session = await auth();
  if (!session?.userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const user = await getPrisma().user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true, githubLogin: true },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    return { success: true, ...resolveGitIdentity(user) };
  } catch (err) {
    console.error('[getGitIdentity] Unexpected error:', err);
    return { success: false, error: 'Failed to resolve git identity' };
  }
}
