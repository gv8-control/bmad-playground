const CREDENTIAL_FAILURE_PATTERNS: RegExp[] = [
  /remote: Invalid username or token/i,
  /remote: Anonymous authentication/i,
  /fatal: Authentication failed for/i,
  /fatal: could not read Username for/i,
  /\b401\s+Unauthorized\b/i,
];

export function isCredentialFailureError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return CREDENTIAL_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export function sanitizeProvisioningErrorMessage(message: string): string {
  if (CREDENTIAL_FAILURE_PATTERNS.some((pattern) => pattern.test(message))) {
    return 'GitHub authentication failed. Please reconnect your GitHub account.';
  }
  if (/fatal: repository .* not found/i.test(message)) {
    return 'Repository not found. Please check your repository connection.';
  }
  if (/No RepoConnection found for user/i.test(message)) {
    return 'No GitHub repository connected. Please connect a repository first.';
  }
  if (/Daytona client is not configured/i.test(message)) {
    return 'Sandbox service is not configured. Please contact support.';
  }
  if (/GitHub credential is marked as failed/i.test(message)) {
    return 'GitHub credential is marked as failed. Please reconnect your GitHub account.';
  }
  return 'Failed to set up the sandbox. Please try again or contact support.';
}
