/**
 * @jest-environment node
 *
 * Integration test for the credential health re-auth full cycle (Story 1.6, AC-3).
 *
 * Closes the 1.6-AC3 PARTIAL coverage gap: existing unit tests verify
 * markCredentialFailed, markCredentialHealthy, and reauthorizeGitHub in
 * isolation. This test wires them through a shared in-memory Prisma mock
 * so the full cycle is exercised end-to-end:
 *
 *   healthy → 401 (failed) → reauthorizeGitHub → markCredentialHealthy → healthy
 *
 * Asserts the RepoConnection row survives the full cycle (not disconnected
 * or deleted) and that credential health returns to 'healthy'.
 */

import type { CredentialHealthStatus } from '@bmad-easy/shared-types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

interface RepoConnectionRow {
  userId: string;
  repoUrl: string;
  credentialHealth: CredentialHealthStatus;
  updatedAt: Date;
}

const repoConnectionStore = new Map<string, RepoConnectionRow>();

const mockUpdateMany = jest.fn(async (args: {
  where: { userId?: string; updatedAt?: Date };
  data: { credentialHealth?: CredentialHealthStatus };
}) => {
  let count = 0;
  for (const [key, row] of repoConnectionStore) {
    if (args.where.userId && row.userId !== args.where.userId) continue;
    if (args.where.updatedAt && row.updatedAt >= args.where.updatedAt) continue;
    if (args.data.credentialHealth) {
      repoConnectionStore.set(key, {
        ...row,
        credentialHealth: args.data.credentialHealth,
        updatedAt: new Date(),
      });
    }
    count++;
  }
  return { count };
});

const mockFindUnique = jest.fn(async (args: {
  where: { userId: string };
  select?: Record<string, boolean>;
}) => {
  for (const [, row] of repoConnectionStore) {
    if (row.userId === args.where.userId) {
      if (args.select) {
        const result: Record<string, unknown> = {};
        for (const [key, include] of Object.entries(args.select)) {
          if (include) result[key] = row[key as keyof RepoConnectionRow];
        }
        return result;
      }
      return { ...row };
    }
  }
  return null;
});

const mockDeleteMany = jest.fn();
const mockDelete = jest.fn();

jest.mock('./prisma', () => ({
  getPrisma: () => ({
    repoConnection: {
      updateMany: mockUpdateMany,
      findUnique: mockFindUnique,
      deleteMany: mockDeleteMany,
      delete: mockDelete,
    },
  }),
}));

const mockDecryptToken = jest.fn();
jest.mock('./crypto', () => {
  const actual = jest.requireActual('./crypto');
  return {
    ...actual,
    decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
  };
});

const mockAuth = jest.fn();
const mockSignIn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import {
  markCredentialFailed,
  markCredentialHealthy,
  getCredentialHealth,
} from './credential-health';
import {
  getCredentialHealthStatus,
  reauthorizeGitHub,
} from '@/actions/credential-health.actions';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = 'usr_reauth_cycle';
const REPO_URL = 'https://github.com/my-org/my-repo';

function seedRepoConnection(health: CredentialHealthStatus = 'healthy'): void {
  repoConnectionStore.clear();
  repoConnectionStore.set(USER_ID, {
    userId: USER_ID,
    repoUrl: REPO_URL,
    credentialHealth: health,
    updatedAt: new Date(),
  });
}

// ─── Re-auth full cycle (AC-3) ─────────────────────────────────────────────────

describe('credential health re-auth full cycle (AC-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repoConnectionStore.clear();
    mockAuth.mockResolvedValue({ userId: USER_ID });
    mockSignIn.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P1] full cycle: healthy → 401 failed → reauthorizeGitHub → healthy, RepoConnection row survives (AC-3)', async () => {
    // 1. Start with a healthy credential
    seedRepoConnection('healthy');
    expect(await getCredentialHealth(USER_ID)).toBe('healthy');

    // 2. Trigger a 401 response → credential health becomes 'failed'
    const capturedAt = new Date();
    await markCredentialFailed(USER_ID, capturedAt);
    expect(await getCredentialHealth(USER_ID)).toBe('failed');

    // 3. Initiate re-auth (calls reauthorizeGitHub)
    await reauthorizeGitHub('/conversations/new');
    expect(mockSignIn).toHaveBeenCalledWith('github', { redirectTo: '/conversations/new' });

    // 4. Simulate post-OAuth callback: markCredentialHealthy is called
    //    (in production, the jwt callback in auth.ts does this after successful OAuth)
    await markCredentialHealthy(USER_ID);

    // 5. Verify credential health returns to 'healthy'
    expect(await getCredentialHealth(USER_ID)).toBe('healthy');

    // 6. Verify the RepoConnection row still exists (was not disconnected/deleted)
    expect(repoConnectionStore.has(USER_ID)).toBe(true);
    const survivingRow = repoConnectionStore.get(USER_ID)!;
    expect(survivingRow.repoUrl).toBe(REPO_URL);
    expect(survivingRow.credentialHealth).toBe('healthy');

    // 7. Verify no delete operations were called during the cycle
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('[P1] getCredentialHealthStatus reflects the full cycle through the Server Action layer (AC-3)', async () => {
    seedRepoConnection('healthy');

    // Verify initial state via Server Action
    let result = await getCredentialHealthStatus();
    expect(result).toEqual({ success: true, status: 'healthy' });

    // Flip to failed
    await markCredentialFailed(USER_ID);
    result = await getCredentialHealthStatus();
    expect(result).toEqual({ success: true, status: 'failed' });

    // Restore to healthy
    await markCredentialHealthy(USER_ID);
    result = await getCredentialHealthStatus();
    expect(result).toEqual({ success: true, status: 'healthy' });

    // Row survives
    expect(repoConnectionStore.has(USER_ID)).toBe(true);
    expect(repoConnectionStore.get(USER_ID)!.repoUrl).toBe(REPO_URL);
  });

  it('[P1] RepoConnection row is not modified by reauthorizeGitHub — only signIn is called, no DB writes (AC-3)', async () => {
    seedRepoConnection('failed');

    const updateCallCountBefore = mockUpdateMany.mock.calls.length;
    await reauthorizeGitHub('/project-map');

    // reauthorizeGitHub should only call signIn, not touch the DB
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalledTimes(updateCallCountBefore);
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();

    // Row is unchanged
    const row = repoConnectionStore.get(USER_ID)!;
    expect(row.credentialHealth).toBe('failed');
    expect(row.repoUrl).toBe(REPO_URL);
  });
});
