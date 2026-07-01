/**
 * @jest-environment node
 *
 * Integration tests for credential-health Server Actions (Story 1.6).
 * Covers getCredentialHealthStatus (authenticated, unauthenticated, no
 * RepoConnection, DB error) and reauthorizeGitHub (calls signIn with
 * correct params).
 */

import type { CredentialHealthStatus } from '@bmad-easy/shared-types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAuth = jest.fn();
const mockSignIn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

const mockGetCredentialHealth = jest.fn();
jest.mock('@/lib/credential-health', () => ({
  getCredentialHealth: (...args: unknown[]) => mockGetCredentialHealth(...args),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import {
  getCredentialHealthStatus,
  reauthorizeGitHub,
} from './credential-health.actions';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION = { userId: 'usr_abc123' };

// ─── getCredentialHealthStatus ────────────────────────────────────────────────

describe('getCredentialHealthStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
  });

  it('[P0] returns healthy for authenticated user with healthy connection', async () => {
    mockGetCredentialHealth.mockResolvedValue('healthy' as CredentialHealthStatus);
    const result = await getCredentialHealthStatus();
    expect(result).toEqual({ success: true, status: 'healthy' });
  });

  it('[P0] returns failed for authenticated user with failed connection', async () => {
    mockGetCredentialHealth.mockResolvedValue('failed' as CredentialHealthStatus);
    const result = await getCredentialHealthStatus();
    expect(result).toEqual({ success: true, status: 'failed' });
  });

  it('[P0] returns healthy for authenticated user with no RepoConnection', async () => {
    mockGetCredentialHealth.mockResolvedValue(null);
    const result = await getCredentialHealthStatus();
    expect(result).toEqual({ success: true, status: 'healthy' });
  });

  it('[P0] returns error for unauthenticated request', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await getCredentialHealthStatus();
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
  });

  it('[P0] returns error on unexpected DB failure', async () => {
    mockGetCredentialHealth.mockRejectedValue(new Error('DB connection lost'));
    const result = await getCredentialHealthStatus();
    expect(result).toEqual({ success: false, error: 'Failed to check credential health' });
  });

  it('[P1] passes session.userId to getCredentialHealth', async () => {
    mockGetCredentialHealth.mockResolvedValue('healthy');
    await getCredentialHealthStatus();
    expect(mockGetCredentialHealth).toHaveBeenCalledWith(SESSION.userId);
  });
});

// ─── reauthorizeGitHub (AC-3) ─────────────────────────────────────────────────

describe('reauthorizeGitHub (AC-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue(undefined);
  });

  it('[P0] calls signIn with "github" provider (AC-3)', async () => {
    await reauthorizeGitHub();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith('github', expect.anything());
  });

  it('[P0] passes callbackUrl as redirectTo to signIn', async () => {
    const callbackUrl = '/projects/my-repo';
    await reauthorizeGitHub(callbackUrl);
    expect(mockSignIn).toHaveBeenCalledWith('github', { redirectTo: callbackUrl });
  });

  it('[P1] passes undefined redirectTo when no callbackUrl provided', async () => {
    await reauthorizeGitHub();
    expect(mockSignIn).toHaveBeenCalledWith('github', { redirectTo: undefined });
  });
});
