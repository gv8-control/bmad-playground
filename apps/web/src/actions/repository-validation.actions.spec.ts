/**
 * @jest-environment node
 *
 * ATDD — Story 1.4: Validate BMAD Initialization in the Connected Repository
 * Unit tests for inspectBmadSetup (core logic) and validateRepository (Server Action).
 *
 * Covers:
 * - AC-1: Confirms _bmad/, _bmad-output/, .claude/ present + BMAD version 6.x
 * - AC-2: Empty _bmad-output/ accepted as valid
 * - AC-3: Missing directories → blocking message + docs link
 * - AC-4: Missing .claude/skills/ → blocking message
 * - AC-5: Empty .claude/skills/ → blocking message
 * - AC-6: Version outside v6.x → blocking message + detected version
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

let mockFetch: jest.Mock;

// ─── Subject under test ───────────────────────────────────────────────────────

import { validateRepository } from './repository-validation.actions';
import { inspectBmadSetup, clearGithubCache } from '@/lib/repository-validation';
import { BMAD_DOCUMENTATION_LINK } from '@bmad-easy/shared-types';
import {
  ACCESS_TOKEN, OWNER, REPO, REPO_URL, SESSION,
  DECRYPTED_TOKEN,
  ROOT_WITH_ALL_DIRS, SKILLS_WITH_MD, SKILLS_WITH_SUBDIRS, MANIFEST_V6_8,
  CONFIG_YAML_V6_8, PACKAGE_JSON_V6,
  githubDirListing, githubFileContent, github404, github403, github500,
  github403PrimaryRateLimit, github403SecondaryRateLimit, githubDirListingPage,
  setupFetchWithOverrides, API_BASE,
} from './repository-validation.test-utils';
import { RateLimitError } from '@/lib/repository-validation';

beforeEach(() => {
  clearGithubCache();
});

// ─── inspectBmadSetup — Success paths (AC-1, AC-2) ────────────────────────────

describe('inspectBmadSetup — successful validation (AC-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
    setupFetchWithOverrides(mockFetch, {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P0] returns valid result when all dirs present, version 6.x, skills found', async () => {
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({
      valid: true,
      bmadVersion: '6.8.0',
      skillsCount: 2,
    });
  });

  it('[P0] includes repositoryUrl and checkedAt in success result', async () => {
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({
      repositoryUrl: `https://github.com/${OWNER}/${REPO}`,
      checkedAt: expect.any(String),
    });
    const checkedAt = (result as { checkedAt: string }).checkedAt;
    expect(checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('[P0] accepts empty _bmad-output/ as valid (AC-2)', async () => {
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true });
  });

  it('[P2] does NOT fetch _bmad-output/ contents — empty directory is accepted by design (AC-2)', async () => {
    await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    const fetchedUrls = mockFetch.mock.calls.map((c) => c[0] as string);
    const bmadOutputContentsCall = fetchedUrls.find((u) => u.includes('/contents/_bmad-output'));
    expect(bmadOutputContentsCall).toBeUndefined();
  });

  it('[P1] counts only skill .md files — README.md and non-md files excluded', async () => {
    const skillsWithMixedFiles = [
      { name: 'bmad-dev-story.md', type: 'file' },
      { name: 'README.md', type: 'file' },
      { name: 'config.json', type: 'file' },
      { name: 'template.txt', type: 'file' },
    ];
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': githubDirListing(skillsWithMixedFiles),
    });

    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, skillsCount: 1 });
  });
});

// ─── inspectBmadSetup — directory-listing pagination (Fix 2) ─────────────────

describe('inspectBmadSetup — GitHub contents pagination beyond a single page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P0] follows Link rel="next" across multiple pages and collects all skill entries', async () => {
    const skillsPage1Url = `${API_BASE}/.claude/skills?page=2`;
    const skillsPage2Url = `${API_BASE}/.claude/skills?page=3`;

    // Page 1: 1 skill + Link → page 2. Page 2: 1 skill + Link → page 3. Page 3: 1 skill, no Link (last page).
    const page1 = [{ name: 'skill-a.md', type: 'file' }];
    const page2 = [{ name: 'skill-b.md', type: 'file' }];
    const page3 = [{ name: 'skill-c.md', type: 'file' }];

    mockFetch.mockImplementation((url: string) => {
      if (url === `${API_BASE}/` || url === API_BASE) {
        return Promise.resolve(githubDirListing(ROOT_WITH_ALL_DIRS));
      }
      if (url === `${API_BASE}/.claude/skills`) {
        return Promise.resolve(githubDirListingPage(page1, skillsPage1Url));
      }
      if (url === skillsPage1Url) {
        return Promise.resolve(githubDirListingPage(page2, skillsPage2Url));
      }
      if (url === skillsPage2Url) {
        return Promise.resolve(githubDirListingPage(page3));
      }
      if (url === `${API_BASE}/_bmad/_config/manifest.yaml`) {
        return Promise.resolve(githubFileContent(MANIFEST_V6_8));
      }
      return Promise.resolve(github404());
    });

    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    // All 3 pages' entries must be counted — a truncated single-page read would only see 1.
    expect(result).toMatchObject({ valid: true, skillsCount: 3 });
  });

  it('[P1] does not follow pagination when the Link header has no rel="next" (single-page, existing behavior preserved)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': githubDirListingPage(SKILLS_WITH_MD.filter((e) => e.name.endsWith('.md'))),
    });

    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true });
    const skillsCalls = mockFetch.mock.calls.filter((c) => (c[0] as string).includes('.claude/skills'));
    expect(skillsCalls).toHaveLength(1);
  });
});

// ─── inspectBmadSetup — Version detection (AC-1, AC-6) ───────────────────────

describe('inspectBmadSetup — version detection (AC-1, AC-6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P0] accepts version 6.0.0', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': githubFileContent('installation:\n  version: 6.0.0\n'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, bmadVersion: '6.0.0' });
  });

  it('[P0] accepts version 6.9.9', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': githubFileContent('installation:\n  version: 6.9.9\n'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, bmadVersion: '6.9.9' });
  });

  it('[P0] rejects version 5.9.9 with UNSUPPORTED_VERSION (AC-6)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': githubFileContent('installation:\n  version: 5.9.9\n'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({
      code: 'UNSUPPORTED_VERSION',
      meta: { detectedVersion: '5.9.9' },
    });
  });

  it('[P0] rejects version 7.0.0 with UNSUPPORTED_VERSION (AC-6)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': githubFileContent('installation:\n  version: 7.0.0\n'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({
      code: 'UNSUPPORTED_VERSION',
      meta: { detectedVersion: '7.0.0' },
    });
  });

  it('[P1] error message for unsupported version states only v6 is supported (AC-6)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': githubFileContent('installation:\n  version: 7.0.0\n'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { message: string };
    expect(result.message).toMatch(/v6/i);
    expect(result.message).toMatch(/7\.0\.0/);
  });

  it('[P0] falls back to _bmad/core/config.yaml when manifest.yaml is absent', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': github404(),
      '_bmad/core/config.yaml': githubFileContent(CONFIG_YAML_V6_8),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, bmadVersion: '6.8.0' });
  });

  it('[P1] falls back to _bmad/package.json when manifest and config.yaml absent', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': github404(),
      '_bmad/core/config.yaml': github404(),
      '_bmad/package.json': githubFileContent(PACKAGE_JSON_V6),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, bmadVersion: '6.1.0' });
  });

  it('[P0] returns UNSUPPORTED_VERSION when version file is malformed', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': githubFileContent('no version here'),
      '_bmad/core/config.yaml': github404(),
      '_bmad/package.json': github404(),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { code: string };
    expect(result.code).toBe('UNSUPPORTED_VERSION');
  });

  it('[P0] returns UNSUPPORTED_VERSION when no version source exists', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': github404(),
      '_bmad/core/config.yaml': github404(),
      '_bmad/package.json': github404(),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { code: string };
    expect(result.code).toBe('UNSUPPORTED_VERSION');
  });

  it('[P2] returns UNSUPPORTED_VERSION when _bmad/package.json contains malformed JSON', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': github404(),
      '_bmad/core/config.yaml': github404(),
      '_bmad/package.json': githubFileContent('{ this is not valid json !!!'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { code: string };
    expect(result.code).toBe('UNSUPPORTED_VERSION');
  });

  it('[P0] prefers manifest.yaml over package.json when both exist and disagree (deterministic priority)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': githubFileContent('installation:\n  version: 6.8.0\n'),
      '_bmad/core/config.yaml': github404(),
      '_bmad/package.json': githubFileContent(JSON.stringify({ name: 'bmad', version: '5.0.0' })),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, bmadVersion: '6.8.0' });
  });

  it('[P1] parses quoted version strings from manifest.yaml', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': githubFileContent('installation:\n  version: "6.8.0"\n'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, bmadVersion: '6.8.0' });
  });

  it('[P1] throws (not UNSUPPORTED_VERSION) when a version probe fails transiently (GitHub 500)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '_bmad/_config/manifest.yaml': github500(),
      '_bmad/core/config.yaml': github404(),
      '_bmad/package.json': github404(),
    });
    await expect(inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO)).rejects.toThrow();
  });
});

// ─── inspectBmadSetup — Missing directories (AC-3) ────────────────────────────

describe('inspectBmadSetup — missing directories (AC-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P0] returns MISSING_DIRECTORY when _bmad/ is absent', async () => {
    setupFetchWithOverrides(mockFetch, {
      '': githubDirListing([
        { name: '_bmad-output', type: 'dir' },
        { name: '.claude', type: 'dir' },
      ]),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({
      code: 'MISSING_DIRECTORY',
      meta: { missing: expect.arrayContaining(['_bmad/']) },
    });
  });

  it('[P0] returns MISSING_DIRECTORY when _bmad-output/ is absent', async () => {
    setupFetchWithOverrides(mockFetch, {
      '': githubDirListing([
        { name: '_bmad', type: 'dir' },
        { name: '.claude', type: 'dir' },
      ]),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({
      code: 'MISSING_DIRECTORY',
      meta: { missing: expect.arrayContaining(['_bmad-output/']) },
    });
  });

  it('[P0] returns MISSING_DIRECTORY when .claude/ is absent', async () => {
    setupFetchWithOverrides(mockFetch, {
      '': githubDirListing([
        { name: '_bmad', type: 'dir' },
        { name: '_bmad-output', type: 'dir' },
      ]),
      '.claude/skills': github404(),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({
      code: 'MISSING_DIRECTORY',
      meta: { missing: expect.arrayContaining(['.claude/']) },
    });
  });

  it('[P0] names ALL missing directories when multiple are absent', async () => {
    setupFetchWithOverrides(mockFetch, {
      '': githubDirListing([{ name: 'README.md', type: 'file' }]),
      '.claude/skills': github404(),
      '_bmad/_config/manifest.yaml': github404(),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { meta: { missing: string[] } };
    expect(result.meta.missing).toEqual(expect.arrayContaining(['_bmad/', '_bmad-output/', '.claude/']));
    expect(result.meta.missing).toHaveLength(3);
  });

  it('[P0] error message includes documentation link (AC-3)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '': githubDirListing([{ name: 'README.md', type: 'file' }]),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { meta: { documentationLink: string } };
    expect(result.meta.documentationLink).toBe(BMAD_DOCUMENTATION_LINK);
  });

  it('[P0] error message names the specific missing prerequisite (AC-3)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '': githubDirListing([
        { name: '_bmad-output', type: 'dir' },
        { name: '.claude', type: 'dir' },
      ]),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { message: string };
    expect(result.message).toMatch(/_bmad/);
  });
});

// ─── inspectBmadSetup — Skills directory validation (AC-4, AC-5) ──────────────

describe('inspectBmadSetup — skills directory validation (AC-4, AC-5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P0] returns NO_SKILLS_FOUND when .claude/skills/ is absent (AC-4)', async () => {
    setupFetchWithOverrides(mockFetch, { '.claude/skills': github404() });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ code: 'NO_SKILLS_FOUND' });
  });

  it('[P0] returns NO_SKILLS_FOUND when .claude/skills/ exists but has no .md files (AC-5)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': githubDirListing([
        { name: 'config.json', type: 'file' },
        { name: 'template.txt', type: 'file' },
      ]),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ code: 'NO_SKILLS_FOUND' });
  });

  it('[P0] returns NO_SKILLS_FOUND when .claude/skills/ contains only README.md (AC-5)', async () => {
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': githubDirListing([{ name: 'README.md', type: 'file' }]),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ code: 'NO_SKILLS_FOUND' });
  });

  it('[P1] error message for missing skills directory states no Skills directory found (AC-4)', async () => {
    setupFetchWithOverrides(mockFetch, { '.claude/skills': github404() });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { message: string };
    expect(result.message).toMatch(/skill/i);
  });

  it('[P1] error message for empty skills directory states no Skills found (AC-5)', async () => {
    setupFetchWithOverrides(mockFetch, { '.claude/skills': githubDirListing([]) });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { message: string };
    expect(result.message).toMatch(/skill/i);
  });

  it('[P0] includes documentation link in skills error (AC-4, AC-5)', async () => {
    setupFetchWithOverrides(mockFetch, { '.claude/skills': github404() });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { meta: { documentationLink: string } };
    expect(result.meta.documentationLink).toBe(BMAD_DOCUMENTATION_LINK);
  });

  it('[P0] counts a directory-style skill when SKILL.md exists inside it', async () => {
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': githubDirListing(SKILLS_WITH_SUBDIRS),
      '.claude/skills/bmad-agent-architect/SKILL.md': githubFileContent('# Architect'),
      '.claude/skills/bmad-agent-dev/SKILL.md': githubFileContent('# Dev'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, skillsCount: 2 });
  });

  it('[P0] excludes a directory-style entry with no SKILL.md inside it', async () => {
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': githubDirListing(SKILLS_WITH_SUBDIRS),
      '.claude/skills/bmad-agent-architect/SKILL.md': githubFileContent('# Architect'),
      '.claude/skills/bmad-agent-dev/SKILL.md': github404(),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, skillsCount: 1 });
  });

  it('[P0] sums flat .md files and valid skill directories in a mixed layout', async () => {
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': githubDirListing([
        { name: 'bmad-dev-story.md', type: 'file' },
        { name: 'bmad-agent-architect', type: 'dir' },
        { name: 'bmad-agent-dev', type: 'dir' },
      ]),
      '.claude/skills/bmad-agent-architect/SKILL.md': githubFileContent('# Architect'),
      '.claude/skills/bmad-agent-dev/SKILL.md': github404(),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ valid: true, skillsCount: 2 });
  });

  it('[P0] returns NO_SKILLS_FOUND when all entries are dirs and none contain SKILL.md', async () => {
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': githubDirListing(SKILLS_WITH_SUBDIRS),
      '.claude/skills/bmad-agent-architect/SKILL.md': github404(),
      '.claude/skills/bmad-agent-dev/SKILL.md': github404(),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ code: 'NO_SKILLS_FOUND' });
  });

  it('[P1] propagates a GitHub error from a per-directory SKILL.md probe', async () => {
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': githubDirListing(SKILLS_WITH_SUBDIRS),
      '.claude/skills/bmad-agent-architect/SKILL.md': github500(),
      '.claude/skills/bmad-agent-dev/SKILL.md': githubFileContent('# Dev'),
    });
    await expect(inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO)).rejects.toThrow();
  });
});

// ─── inspectBmadSetup — GitHub API errors ────────────────────────────────────

describe('inspectBmadSetup — GitHub API errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P1] returns MISSING_DIRECTORY on a genuine GitHub 403 — token is valid but lacks access', async () => {
    mockFetch.mockResolvedValue(github403());
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ code: 'MISSING_DIRECTORY' });
  });

  it('[P1] throws on GitHub 500', async () => {
    mockFetch.mockResolvedValue(github500());
    await expect(inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO)).rejects.toThrow();
  });

  it('[P1] throws on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO)).rejects.toThrow();
  });
});

// ─── inspectBmadSetup — 403 rate-limit vs credential-failure (Fix 1) ─────────

describe('inspectBmadSetup — 403 rate-limit vs credential-failure conflation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P0] throws RateLimitError (not CredentialFailureError) on 403 with X-RateLimit-Remaining: 0 (primary rate limit)', async () => {
    mockFetch.mockResolvedValue(github403PrimaryRateLimit());
    await expect(inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO)).rejects.toThrow(RateLimitError);
  });

  it('[P0] throws RateLimitError on 403 with a secondary-rate-limit / abuse-detection body message', async () => {
    mockFetch.mockResolvedValue(github403SecondaryRateLimit());
    await expect(inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO)).rejects.toThrow(RateLimitError);
  });

  it('[P0] does NOT throw for a genuine 403 permission denial — returns structured error instead', async () => {
    mockFetch.mockResolvedValue(github403());
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(result).toMatchObject({ code: 'MISSING_DIRECTORY' });
  });
});

// ─── inspectBmadSetup — Error priority ───────────────────────────────────────

describe('inspectBmadSetup — error priority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P1] returns MISSING_DIRECTORY before UNSUPPORTED_VERSION when both apply', async () => {
    setupFetchWithOverrides(mockFetch, {
      '': githubDirListing([
        { name: '_bmad-output', type: 'dir' },
        { name: '.claude', type: 'dir' },
      ]),
      '_bmad/_config/manifest.yaml': githubFileContent('installation:\n  version: 5.0.0\n'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { code: string };
    expect(result.code).toBe('MISSING_DIRECTORY');
  });

  it('[P1] returns UNSUPPORTED_VERSION before NO_SKILLS_FOUND when both apply', async () => {
    setupFetchWithOverrides(mockFetch, {
      '.claude/skills': github404(),
      '_bmad/_config/manifest.yaml': githubFileContent('installation:\n  version: 5.0.0\n'),
    });
    const result = await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO) as { code: string };
    expect(result.code).toBe('UNSUPPORTED_VERSION');
  });
});

// ─── inspectBmadSetup — GitHub API call patterns ─────────────────────────────

describe('inspectBmadSetup — GitHub API call patterns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
    setupFetchWithOverrides(mockFetch, {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('[P0] uses Bearer token in Authorization header', async () => {
    await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        }),
      }),
    );
  });

  it('[P0] uses AbortSignal.timeout(10_000) on all fetch calls', async () => {
    await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
    for (const call of mockFetch.mock.calls) {
      const options = call[1] as { signal: AbortSignal };
      expect(options.signal).toBeDefined();
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.signal.aborted).toBe(false);
    }
  });

  it('[P1] aborts fetch when GitHub API exceeds 10s timeout (L-5)', async () => {
    jest.useFakeTimers();
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => reject(abortError), 10_100);
    }));

    const promise = inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    jest.advanceTimersByTime(10_100);
    await expect(promise).rejects.toThrow();
    jest.useRealTimers();
  });

  it('[P1] includes Accept and X-GitHub-Api-Version headers', async () => {
    await inspectBmadSetup(ACCESS_TOKEN, OWNER, REPO);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
      }),
    );
  });
});

// ─── validateRepository — Server Action (AC-1 through AC-6) ───────────────────

describe('validateRepository — Server Action', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
    mockAuth.mockResolvedValue(SESSION);
    mockResolveOAuthToken.mockResolvedValue(DECRYPTED_TOKEN);
    mockMarkCredentialFailed.mockResolvedValue(undefined);
    setupFetchWithOverrides(mockFetch, {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P0] rejects a non-GitHub URL with errorCode INVALID_URL', async () => {
    const result = await validateRepository('https://gitlab.com/owner/repo');
    expect(result).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('[P0] returns errorCode UNKNOWN when session is missing', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });

  it('[P0] returns errorCode NO_CREDENTIAL when OAuthCredential row is absent', async () => {
    mockResolveOAuthToken.mockRejectedValue(new CredentialFailureError(401));
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({ errorCode: 'NO_CREDENTIAL' });
  });

  it('[P0] returns valid result on successful validation', async () => {
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({
      valid: true,
      repositoryUrl: REPO_URL,
      bmadVersion: '6.8.0',
      skillsCount: 2,
    });
  });

  it('[P0] rejects a non-string repoUrl with errorCode INVALID_URL instead of throwing', async () => {
    const result = await validateRepository(null as unknown as string);
    expect(result).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('[P0] rejects dot-segment owner/repo (path traversal) with errorCode INVALID_URL', async () => {
    const result = await validateRepository('https://github.com/../..');
    expect(result).toMatchObject({ errorCode: 'INVALID_URL' });
  });

  it('[P0] propagates validation errors from inspectBmadSetup', async () => {
    setupFetchWithOverrides(mockFetch, {
      '': githubDirListing([{ name: 'README.md', type: 'file' }]),
    });
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({ code: 'MISSING_DIRECTORY' });
  });

  it('[P0] decrypted access token is NEVER returned to the client', async () => {
    const result = await validateRepository(REPO_URL);
    expect(JSON.stringify(result)).not.toContain(DECRYPTED_TOKEN);
  });

  it('[P1] accepts URL with .git suffix', async () => {
    const result = await validateRepository('https://github.com/my-org/my-repo.git');
    expect(result).toMatchObject({ valid: true });
  });

  it('[P1] accepts URL with trailing slash', async () => {
    const result = await validateRepository('https://github.com/my-org/my-repo/');
    expect(result).toMatchObject({ valid: true });
  });

  it('[P1] returns errorCode UNKNOWN when resolveOAuthToken throws non-CredentialFailureError (corrupted credential)', async () => {
    mockResolveOAuthToken.mockRejectedValue(new Error('Decryption failed: invalid auth tag'));
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });

  it('[P0] calls markCredentialFailed when resolveOAuthToken throws CredentialFailureError (AC-1)', async () => {
    mockResolveOAuthToken.mockRejectedValue(new CredentialFailureError(401));
    await validateRepository(REPO_URL);
    expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId, expect.any(Date));
  });

  it('[P1] returns MISSING_DIRECTORY (not NO_CREDENTIAL) when GitHub returns 403 — token is valid, paths inaccessible', async () => {
    mockFetch.mockResolvedValue(github403());
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({ code: 'MISSING_DIRECTORY' });
  });

  it('[P0] does NOT call markCredentialFailed when inspectBmadSetup encounters a 403', async () => {
    mockFetch.mockResolvedValue(github403());
    await validateRepository(REPO_URL);
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
  });

  it('[P0] returns errorCode RATE_LIMITED (not NO_CREDENTIAL) when GitHub 403 is a primary rate limit, and does NOT call markCredentialFailed', async () => {
    mockFetch.mockResolvedValue(github403PrimaryRateLimit());
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({ errorCode: 'RATE_LIMITED' });
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
  });

  it('[P0] returns errorCode RATE_LIMITED when GitHub 403 is a secondary rate limit, and does NOT call markCredentialFailed', async () => {
    mockFetch.mockResolvedValue(github403SecondaryRateLimit());
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({ errorCode: 'RATE_LIMITED' });
    expect(mockMarkCredentialFailed).not.toHaveBeenCalled();
  });

  it('[P1] returns errorCode UNKNOWN when inspectBmadSetup throws (GitHub API 500)', async () => {
    mockFetch.mockResolvedValue(github500());
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });

  it('[P1] returns errorCode UNKNOWN when inspectBmadSetup throws (network failure)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await validateRepository(REPO_URL);
    expect(result).toMatchObject({ errorCode: 'UNKNOWN' });
  });
});
