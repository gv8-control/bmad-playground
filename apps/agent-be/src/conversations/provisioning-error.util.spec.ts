/**
 * @jest-environment node
 *
 * Unit tests for provisioning error utilities.
 *
 * Covers credential failure detection (isCredentialFailureError) reused from
 * the streaming tool-pill-classifier patterns, and raw error message
 * sanitization (sanitizeProvisioningErrorMessage) emitted via the
 * SESSION_ERROR SSE event when ConversationsService.provisionSandbox fails.
 */
import {
  isCredentialFailureError,
  sanitizeProvisioningErrorMessage,
} from './provisioning-error.util';

describe('[P0] isCredentialFailureError', () => {
  it('returns true for fatal: Authentication failed for ...', () => {
    expect(
      isCredentialFailureError(
        new Error('fatal: Authentication failed for https://github.com/user/repo.git'),
      ),
    ).toBe(true);
  });

  it('returns true for remote: Invalid username or token', () => {
    expect(
      isCredentialFailureError(new Error('remote: Invalid username or token')),
    ).toBe(true);
  });

  it('returns true for fatal: could not read Username for ...', () => {
    expect(
      isCredentialFailureError(
        new Error('fatal: could not read Username for https://github.com/user/repo.git'),
      ),
    ).toBe(true);
  });

  it('returns true for a plain string 401 Unauthorized (not an Error instance)', () => {
    expect(isCredentialFailureError('401 Unauthorized')).toBe(true);
  });

  it('returns true for remote: Anonymous authentication', () => {
    expect(
      isCredentialFailureError(new Error('remote: Anonymous authentication')),
    ).toBe(true);
  });

  it('returns false for fatal: repository not found', () => {
    expect(
      isCredentialFailureError(new Error('fatal: repository not found')),
    ).toBe(false);
  });

  it('returns false for an unrelated error', () => {
    expect(isCredentialFailureError(new Error('Some other error'))).toBe(false);
  });

  it('[P1] returns false for null', () => {
    expect(isCredentialFailureError(null)).toBe(false);
  });

  it('[P1] returns false for undefined', () => {
    expect(isCredentialFailureError(undefined)).toBe(false);
  });
});

describe('[P0] sanitizeProvisioningErrorMessage', () => {
  it('maps credential failure to reconnect prompt', () => {
    expect(
      sanitizeProvisioningErrorMessage(
        'fatal: Authentication failed for https://github.com/user/repo.git',
      ),
    ).toBe('GitHub authentication failed. Please reconnect your GitHub account.');
  });

  it('maps repository not found to connection check prompt', () => {
    expect(
      sanitizeProvisioningErrorMessage('fatal: repository \'foo/bar\' not found'),
    ).toBe('Repository not found. Please check your repository connection.');
  });

  it('maps No RepoConnection found to connect prompt', () => {
    expect(
      sanitizeProvisioningErrorMessage('No RepoConnection found for user abc123'),
    ).toBe('No GitHub repository connected. Please connect a repository first.');
  });

  it('maps Daytona client is not configured to support prompt', () => {
    expect(
      sanitizeProvisioningErrorMessage('Daytona client is not configured'),
    ).toBe('Sandbox service is not configured. Please contact support.');
  });

  it('maps GitHub credential marked as failed to reconnect prompt', () => {
    expect(
      sanitizeProvisioningErrorMessage('GitHub credential is marked as failed'),
    ).toBe('GitHub credential is marked as failed. Please reconnect your GitHub account.');
  });

  it('maps unknown error to generic support prompt', () => {
    expect(sanitizeProvisioningErrorMessage('something completely unexpected')).toBe(
      'Failed to set up the sandbox. Please try again or contact support.',
    );
  });
});
