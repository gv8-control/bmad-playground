/**
 * @jest-environment node
 *
 * ATDD — Story 1.3: Connect a Repository by URL
 * Integration tests for the connectRepository Server Action.
 * Covers AC-2 (URL validation + write-access check), AC-3 (encrypted storage,
 * token never returned to client), AC-4 (descriptive per-cause error messages).
 *
 * RED PHASE: all tests are skipped until repo-connection.actions.ts is created (Task 4).
 * Remove test.skip() one describe-block at a time as you implement each task.
 *
 * Module will not resolve until Task 4.1 creates the actions file — that
 * "Cannot find module" error is the expected TDD red-phase signal.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockResolveOAuthToken = jest.fn();
const mockMarkCredentialFailed = jest.fn();

class CredentialFailureError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Credential failure: GitHub API returned ${statusCode}`);
    this.name = 'CredentialFailureError';
  }
}

jest.mock('@/lib/credential-health', () => ({
  resolveOAuthToken: (...args: unknown[]) => mockResolveOAuthToken(...args),
  markCredentialFailed: (...args: unknown[]) => mockMarkCredentialFailed(...args),
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
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Subject under test ───────────────────────────────────────────────────────

import { connectRepository } from './repo-connection.actions';
import { BMAD_DOCUMENTATION_LINK } from '@bmad-easy/shared-types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION = { userId: 'usr_abc123' };
const VALID_URL = 'https://github.com/my-org/my-repo';
const DECRYPTED_TOKEN = 'gho_real_token';

const githubOkWithPush = {
  ok: true,
  status: 200,
  json: async () => ({ permissions: { push: true, pull: true, admin: false } }),
};

// ─── Validation API fixtures (Story 1.4) ──────────────────────────────────────

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

// ─── URL validation (AC-2, Task 4.2) ─────────────────────────────────────────

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

// ─── Session and credential retrieval (AC-2, AC-3) ───────────────────────────

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
    expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId);
  });
});

// ─── GitHub API error cases (AC-4, Task 4.5) ─────────────────────────────────

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
    expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId);
  });

  it('[P0] calls markCredentialFailed on 403 response (AC-1)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });
    await connectRepository(VALID_URL);
    expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId);
  });

  it('[P0] calls markCredentialFailed when inspectBmadSetup throws CredentialFailureError (AC-1)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === 'https://api.github.com/repos/my-org/my-repo') {
        return Promise.resolve(githubOkWithPush);
      }
      return Promise.resolve({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) });
    });
    const result = await connectRepository(VALID_URL);
    expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId);
    expect(result).toMatchObject({ errorCode: 'NO_CREDENTIAL' });
  });
});

// ─── Successful connection (AC-2, AC-3, Task 4.6) ────────────────────────────

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

// ─── BMAD validation integration (Story 1.4) ────────────────────────────────

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
