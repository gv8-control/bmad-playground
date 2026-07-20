/** @jest-environment node */

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockResolveOAuthToken = jest.fn();
const mockMarkCredentialFailed = jest.fn();
const mockGetCredentialHealth = jest.fn();

class CredentialFailureError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Credential failure: GitHub API returned ${statusCode}`);
    this.name = 'CredentialFailureError';
  }
}

jest.mock('@/lib/credential-health', () => ({
  resolveOAuthToken: (...args: unknown[]) => mockResolveOAuthToken(...args),
  markCredentialFailed: (...args: unknown[]) => mockMarkCredentialFailed(...args),
  getCredentialHealth: (...args: unknown[]) => mockGetCredentialHealth(...args),
  CredentialFailureError,
}));

const mockUpsertRepoConnection = jest.fn();
jest.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    repoConnection: { upsert: mockUpsertRepoConnection },
  }),
}));

let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  clearGithubCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

import { connectRepository } from './repo-connection.actions';
import { getCredentialHealth } from '@/lib/credential-health';
import { BMAD_DOCUMENTATION_LINK, type CredentialHealthStatus } from '@bmad-easy/shared-types';
import { clearGithubCache } from '@/lib/repository-validation';

const SESSION = { userId: 'usr_abc123' };
const VALID_URL = 'https://github.com/my-org/my-repo';
const DECRYPTED_TOKEN = 'gho_real_token';

const githubOkWithPush = {
  ok: true,
  status: 200,
  json: async () => ({ permissions: { push: true, pull: true, admin: false } }),
};

/** Builds a minimal Headers-like object for mocked fetch responses. */
function mockHeaders(entries: Record<string, string> = {}): { get(name: string): string | null } {
  const lower = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

const CONTENTS_BASE = 'https://api.github.com/repos/my-org/my-repo/contents';
const ROOT_DIRS = [
  { name: '_bmad', type: 'dir' },
  { name: '_bmad-output', type: 'dir' },
  { name: '.claude', type: 'dir' },
];
const SKILLS_LISTING = [
  { name: 'bmad-dev-story.md', type: 'file' },
  { name: 'bmad-create-prd.md', type: 'file' },
];
const MANIFEST_V6 = Buffer.from(
  'installation:\n  version: 6.8.0\n',
).toString('base64');

function setupValidationHappyPath() {
  mockFetch.mockImplementation((url: string) => {
    if (url === 'https://api.github.com/repos/my-org/my-repo') {
      return Promise.resolve(githubOkWithPush);
    }
    if (url === `${CONTENTS_BASE}/` || url === `${CONTENTS_BASE}`) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ROOT_DIRS });
    }
    if (url === `${CONTENTS_BASE}/.claude/skills`) {
      return Promise.resolve({ ok: true, status: 200, json: async () => SKILLS_LISTING });
    }
    if (url === `${CONTENTS_BASE}/_bmad/_config/manifest.yaml`) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ type: 'file', encoding: 'base64', content: MANIFEST_V6 }),
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) });
  });
}

describe('connectRepository — URL validation (AC-2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockResolvedValue(DECRYPTED_TOKEN);
    mockMarkCredentialFailed.mockResolvedValue(undefined);
    setupValidationHappyPath();
    mockUpsertRepoConnection.mockResolvedValue({});
  });

  it('[P0] rejects a non-GitHub URL with errorCode INVALID_URL', async () => {
    const result = await connectRepository('https://gitlab.com/owner/repo');
    expect(result).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('[P0] rejects a plain string (not a URL) with errorCode INVALID_URL', async () => {
    const result = await connectRepository('not-a-url');
    expect(result).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('[P0] rejects a GitHub profile URL (no repo segment) with errorCode INVALID_URL', async () => {
    const result = await connectRepository('https://github.com/my-org');
    expect(result).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('[P1] error message for invalid URL references the expected github.com format', async () => {
    const result = await connectRepository('bad-url') as { error: string; errorCode: string };
    expect(result.error).toMatch(/github\.com/i);
  });

  it('[P0] accepts a URL with .git suffix (normalises it before storage)', async () => {
    const result = await connectRepository('https://github.com/my-org/my-repo.git');
    expect(result).toEqual({ success: true });
  });

  it('[P0] accepts a URL with trailing slash (normalises it before storage)', async () => {
    const result = await connectRepository('https://github.com/my-org/my-repo/');
    expect(result).toEqual({ success: true });
  });
});

describe('connectRepository — session and credential checks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] returns errorCode UNKNOWN when session is missing', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });

  it('[P0] returns errorCode NO_CREDENTIAL when OAuthCredential row is absent', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockRejectedValue(new CredentialFailureError(401));
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'NO_CREDENTIAL' });
  });

  it('[P1] NO_CREDENTIAL error message tells user to sign out and sign in again', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockRejectedValue(new CredentialFailureError(401));
    const result = await connectRepository(VALID_URL) as { error: string };
    expect(result.error).toMatch(/sign.*(out|in)/i);
  });

  it('[P1] returns errorCode UNKNOWN when resolveOAuthToken throws non-CredentialFailureError', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockRejectedValue(new Error('DB connection lost'));
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });

  it('[P0] calls markCredentialFailed when resolveOAuthToken throws CredentialFailureError (AC-1)', async () => {
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockRejectedValue(new CredentialFailureError(401));
    await connectRepository(VALID_URL);
    expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId, expect.any(Date));
  });
});

describe('connectRepository — GitHub API errors (AC-4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockResolvedValue(DECRYPTED_TOKEN);
    mockMarkCredentialFailed.mockResolvedValue(undefined);
  });

  it('[P0] returns errorCode NOT_FOUND when GitHub API returns 404 (AC-4)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'NOT_FOUND' });
  });

  it('[P1] NOT_FOUND error message names the specific cause (AC-4)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const result = await connectRepository(VALID_URL) as { error: string };
    expect(result.error).toMatch(/not found/i);
  });

  it('[P0] returns errorCode ORG_RESTRICTION when GitHub 403 indicates org OAuth App restriction (AC-4)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message:
          'Although you appear to have the correct authorization credentials, the organization has enabled OAuth App access restrictions.',
      }),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'ORG_RESTRICTION' });
  });

  it('[P0] ORG_RESTRICTION error explicitly names the org-restriction cause — NOT a generic message (AC-4)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message: 'Although you appear to have the correct authorization credentials, the organization has enabled OAuth App access restrictions.',
      }),
    });
    const result = await connectRepository(VALID_URL) as { error: string };
    expect(result.error).toMatch(/organization/i);
    expect(result.error).not.toMatch(/couldn.t connect|something went wrong|unexpected/i);
  });

  it('[P0] returns errorCode INSUFFICIENT_PERMISSION when GitHub returns 403 without org restriction (AC-4)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'INSUFFICIENT_PERMISSION' });
  });

  it('[P0] does NOT call markCredentialFailed for a 403 permission denial — token is valid but lacks repo access', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
      headers: mockHeaders(),
    });
    await connectRepository(VALID_URL);
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
  });

  it('[P0] returns errorCode RATE_LIMITED (not a credential failure) on 403 with X-RateLimit-Remaining: 0 (primary rate limit)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'API rate limit exceeded for user ID 123.' }),
      headers: mockHeaders({ 'X-RateLimit-Remaining': '0' }),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'RATE_LIMITED' });
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
  });

  it('[P1] RATE_LIMITED error message mentions the rate limit', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'API rate limit exceeded for user ID 123.' }),
      headers: mockHeaders({ 'X-RateLimit-Remaining': '0' }),
    });
    const result = await connectRepository(VALID_URL) as { error: string };
    expect(result.error).toMatch(/rate limit/i);
  });

  it('[P0] returns errorCode RATE_LIMITED on 403 secondary rate limit (abuse detection) body, without a rate-limit header', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.',
      }),
      headers: mockHeaders(),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'RATE_LIMITED' });
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
  });

  it('[P0] ORG_RESTRICTION still takes precedence over a generic 403 when org-restriction message is present (existing behavior preserved)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message:
          'Although you appear to have the correct authorization credentials, the organization has enabled OAuth App access restrictions.',
      }),
      headers: mockHeaders(),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'ORG_RESTRICTION' });
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
  });

  it('[P0] returns errorCode INSUFFICIENT_PERMISSION when permissions.push is false (AC-2, AC-4)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ permissions: { push: false, pull: true } }),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'INSUFFICIENT_PERMISSION' });
  });

  it('[P1] returns errorCode INSUFFICIENT_PERMISSION when permissions field is absent (AC-2)', async () => {
    // GitHub may omit permissions for repos the user accesses via org membership
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ name: 'my-repo' }),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'INSUFFICIENT_PERMISSION' });
  });

  it('[P1] returns errorCode UNKNOWN for an unexpected GitHub HTTP status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });

  it('[P1] returns errorCode UNKNOWN when fetch throws (network failure)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });

  it('[P0] calls markCredentialFailed on 401 response (AC-1)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await connectRepository(VALID_URL);
    expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId, expect.any(Date));
  });

  it('[P0] does NOT call markCredentialFailed on 403 response — token is valid, access denied', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });
    await connectRepository(VALID_URL);
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
  });

  it('[P0] does NOT call markCredentialFailed when validation encounters 403 — access denied per-path, not credential failure', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === 'https://api.github.com/repos/my-org/my-repo') {
        return Promise.resolve(githubOkWithPush);
      }
      return Promise.resolve({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) });
    });
    const result = await connectRepository(VALID_URL);
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
    // A 403 on contents API returns null → dirs appear missing → MISSING_DIRECTORY
    expect(result).toMatchObject({ errorCode: 'MISSING_DIRECTORY' });
  });
});

describe('connectRepository — successful connection (AC-2, AC-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockResolvedValue(DECRYPTED_TOKEN);
    mockMarkCredentialFailed.mockResolvedValue(undefined);
    setupValidationHappyPath();
    mockUpsertRepoConnection.mockResolvedValue({});
  });

  it('[P0] returns { success: true } when repo is accessible with write access', async () => {
    const result = await connectRepository(VALID_URL);
    expect(result).toEqual({ success: true });
  });

  it('[P0] upserts RepoConnection with repoUrl and credentialHealth "healthy" (AC-3)', async () => {
    await connectRepository(VALID_URL);
    expect(mockUpsertRepoConnection).toHaveBeenCalledWith({
      where: { userId: SESSION.userId },
      update: expect.objectContaining({ repoUrl: VALID_URL, credentialHealth: 'healthy' }),
      create: expect.objectContaining({
        userId: SESSION.userId,
        repoUrl: VALID_URL,
        credentialHealth: 'healthy',
      }),
    });
  });

  it('[P1] normalises .git suffix from the stored repoUrl (stores canonical form)', async () => {
    await connectRepository('https://github.com/my-org/my-repo.git');
    expect(mockUpsertRepoConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ repoUrl: VALID_URL }),
      }),
    );
  });

  it('[P0] calls the GitHub API with Bearer token in Authorization header (AC-2)', async () => {
    await connectRepository(VALID_URL);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.github.com/repos/my-org/my-repo'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${DECRYPTED_TOKEN}`,
        }),
      }),
    );
  });

  it('[P0] decrypted access token is NEVER returned to the client (AC-3)', async () => {
    const result = await connectRepository(VALID_URL);
    // The raw decrypted token value must not appear anywhere in the return value
    expect(JSON.stringify(result)).not.toContain(DECRYPTED_TOKEN);
  });
});

describe('connectRepository — BMAD validation integration (Story 1.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockResolvedValue(DECRYPTED_TOKEN);
    mockMarkCredentialFailed.mockResolvedValue(undefined);
    mockUpsertRepoConnection.mockResolvedValue({});
  });

  it('[P0] returns errorCode MISSING_DIRECTORY when _bmad/ is absent from the repo', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === 'https://api.github.com/repos/my-org/my-repo') {
        return Promise.resolve(githubOkWithPush);
      }
      if (url === `${CONTENTS_BASE}/` || url === `${CONTENTS_BASE}`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            { name: '_bmad-output', type: 'dir' },
            { name: '.claude', type: 'dir' },
          ],
        });
      }
      if (url === `${CONTENTS_BASE}/.claude/skills`) {
        return Promise.resolve({ ok: true, status: 200, json: async () => SKILLS_LISTING });
      }
      if (url === `${CONTENTS_BASE}/_bmad/_config/manifest.yaml`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ type: 'file', encoding: 'base64', content: MANIFEST_V6 }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) });
    });

    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'MISSING_DIRECTORY' });
  });

  it('[P0] returns errorCode UNSUPPORTED_VERSION when BMAD version is 5.x', async () => {
    const manifestV5 = Buffer.from('installation:\n  version: 5.9.9\n').toString('base64');
    mockFetch.mockImplementation((url: string) => {
      if (url === 'https://api.github.com/repos/my-org/my-repo') {
        return Promise.resolve(githubOkWithPush);
      }
      if (url === `${CONTENTS_BASE}/` || url === `${CONTENTS_BASE}`) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ROOT_DIRS });
      }
      if (url === `${CONTENTS_BASE}/.claude/skills`) {
        return Promise.resolve({ ok: true, status: 200, json: async () => SKILLS_LISTING });
      }
      if (url === `${CONTENTS_BASE}/_bmad/_config/manifest.yaml`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ type: 'file', encoding: 'base64', content: manifestV5 }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) });
    });

    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'UNSUPPORTED_VERSION' });
  });

  it('[P0] returns errorCode NO_SKILLS_FOUND when .claude/skills/ is empty', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === 'https://api.github.com/repos/my-org/my-repo') {
        return Promise.resolve(githubOkWithPush);
      }
      if (url === `${CONTENTS_BASE}/` || url === `${CONTENTS_BASE}`) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ROOT_DIRS });
      }
      if (url === `${CONTENTS_BASE}/.claude/skills`) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      }
      if (url === `${CONTENTS_BASE}/_bmad/_config/manifest.yaml`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ type: 'file', encoding: 'base64', content: MANIFEST_V6 }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) });
    });

    const result = await connectRepository(VALID_URL);
    expect(result).toMatchObject({ errorCode: 'NO_SKILLS_FOUND' });
  });

  it('[P0] does NOT upsert RepoConnection when validation fails', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === 'https://api.github.com/repos/my-org/my-repo') {
        return Promise.resolve(githubOkWithPush);
      }
      if (url === `${CONTENTS_BASE}/` || url === `${CONTENTS_BASE}`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ name: 'README.md', type: 'file' }],
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) });
    });

    await connectRepository(VALID_URL);
    expect(mockUpsertRepoConnection).not.toHaveBeenCalled();
  });

  it('[P0] includes documentationLink in validation error response', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === 'https://api.github.com/repos/my-org/my-repo') {
        return Promise.resolve(githubOkWithPush);
      }
      if (url === `${CONTENTS_BASE}/` || url === `${CONTENTS_BASE}`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ name: 'README.md', type: 'file' }],
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) });
    });

    const result = await connectRepository(VALID_URL) as { documentationLink?: string };
    expect(result.documentationLink).toBe(BMAD_DOCUMENTATION_LINK);
  });

  it('[P0] upserts RepoConnection when validation passes', async () => {
    setupValidationHappyPath();
    await connectRepository(VALID_URL);
    expect(mockUpsertRepoConnection).toHaveBeenCalledTimes(1);
  });
});

describe('connectRepository — credential health flip within one operation cycle (AC-1, NFR-R1)', () => {
  let healthState: CredentialHealthStatus;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockResolvedValue(DECRYPTED_TOKEN);

    healthState = 'healthy';
    // setImmediate makes the flip genuinely async (macrotask, not microtask),
    // so the test proves the action awaits markCredentialFailed before
    // returning — a fire-and-forget would leave healthState 'healthy' when
    // queried immediately after the action resolves.
    mockMarkCredentialFailed.mockImplementation(async (userId: string) => {
      expect(userId).toBe(SESSION.userId);
      await new Promise<void>((resolve) => setImmediate(resolve));
      healthState = 'failed';
    });
    // Must read healthState eagerly (no await before the read) for the
    // macrotask timing to discriminate awaited vs fire-and-forget.
    mockGetCredentialHealth.mockImplementation(async (userId: string) => {
      expect(userId).toBe(SESSION.userId);
      return healthState;
    });
  });

  // Reset mock implementations so the setImmediate-based impl doesn't leak
  // into other describe blocks if tests are appended after this one.
  afterAll(() => {
    mockMarkCredentialFailed.mockReset();
    mockGetCredentialHealth.mockReset();
  });

  it('[P0] credential health is "failed" immediately after the GitHub API 401 action returns — flip completes within one operation cycle (AC-1, NFR-R1)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    await connectRepository(VALID_URL);

    // No artificial delay — query health immediately after the action resolves.
    const health = await getCredentialHealth(SESSION.userId);
    expect(health).toBe('failed');
  });

  it('[P0] credential health is "failed" immediately after resolveOAuthToken throws CredentialFailureError(401) — flip completes within one operation cycle (AC-1, NFR-R1)', async () => {
    mockResolveOAuthToken.mockRejectedValue(new CredentialFailureError(401));
    setupValidationHappyPath();

    await connectRepository(VALID_URL);

    const health = await getCredentialHealth(SESSION.userId);
    expect(health).toBe('failed');
  });
});
