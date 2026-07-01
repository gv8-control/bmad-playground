import type { GitUserConfig } from '@bmad-easy/shared-types';

export interface GitIdentityUser {
  name: string | null;
  email: string | null;
  githubLogin: string;
}

export function resolveGitIdentity(user: GitIdentityUser): GitUserConfig {
  const name = user.name && user.name.trim().length > 0
    ? user.name
    : user.githubLogin;

  const email = user.email && user.email.trim().length > 0
    ? user.email
    : `${user.githubLogin}@users.noreply.github.com`;

  return { name, email };
}
