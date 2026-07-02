export const ACCESS_TOKEN = 'gho_real_token';
export const OWNER = 'my-org';
export const REPO = 'my-repo';
export const REPO_URL = 'https://github.com/my-org/my-repo';
export const SESSION = { userId: 'usr_abc123' };
export const ENCRYPTED_CREDENTIAL = {
  userId: 'usr_abc123',
  encryptedDek: 'enc_dek',
  dekNonce: 'dek_nonce',
  encryptedToken: 'enc_token',
  tokenNonce: 'token_nonce',
};
export const DECRYPTED_TOKEN = 'gho_real_token';

export const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

export const ROOT_WITH_ALL_DIRS = [
  { name: '_bmad', type: 'dir' },
  { name: '_bmad-output', type: 'dir' },
  { name: '.claude', type: 'dir' },
  { name: 'README.md', type: 'file' },
  { name: '.gitignore', type: 'file' },
];

export const SKILLS_WITH_MD = [
  { name: 'bmad-dev-story.md', type: 'file' },
  { name: 'bmad-create-prd.md', type: 'file' },
  { name: 'README.md', type: 'file' },
];

export const SKILLS_WITH_SUBDIRS = [
  { name: 'bmad-agent-architect', type: 'dir' },
  { name: 'bmad-agent-dev', type: 'dir' },
];

export const MANIFEST_V6_8 = `installation:\n  version: 6.8.0\n  installDate: 2026-06-11T18:58:05.904Z\n`;

export const CONFIG_YAML_V6_8 = `# Core Module Configuration\n# Version: 6.8.0\n# Date: 2026-06-11T18:58:05.813Z\n\nuser_name: Marius\n`;

export const PACKAGE_JSON_V6 = JSON.stringify({ name: 'bmad', version: '6.1.0' });

/** Builds a minimal Headers-like object for mocked fetch responses. */
export function mockHeaders(entries: Record<string, string> = {}): { get(name: string): string | null } {
  const lower = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

export function githubDirListing(
  entries: Array<{ name: string; type: string }>,
  headers: Record<string, string> = {},
) {
  return {
    ok: true,
    status: 200,
    json: async () => entries,
    headers: mockHeaders(headers),
  };
}

export function githubFileContent(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      type: 'file',
      encoding: 'base64',
      content: Buffer.from(content).toString('base64'),
    }),
    headers: mockHeaders(),
  };
}

export function github404() {
  return {
    ok: false,
    status: 404,
    json: async () => ({ message: 'Not Found' }),
    headers: mockHeaders(),
  };
}

/** Genuine 403 (no rate-limit signal) — historically mislabeled "rate limit" by its body message alone. */
export function github403() {
  return {
    ok: false,
    status: 403,
    json: async () => ({ message: 'API rate limit exceeded' }),
    headers: mockHeaders(),
  };
}

/** 403 carrying GitHub's primary rate-limit signal (X-RateLimit-Remaining: 0). */
export function github403PrimaryRateLimit() {
  return {
    ok: false,
    status: 403,
    json: async () => ({ message: 'API rate limit exceeded for user ID 123.' }),
    headers: mockHeaders({ 'X-RateLimit-Remaining': '0' }),
  };
}

/** 403 carrying GitHub's secondary rate-limit / abuse-detection body message. */
export function github403SecondaryRateLimit() {
  return {
    ok: false,
    status: 403,
    json: async () => ({
      message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.',
    }),
    headers: mockHeaders(),
  };
}

export function github500() {
  return {
    ok: false,
    status: 500,
    json: async () => ({ message: 'Internal Server Error' }),
    headers: mockHeaders(),
  };
}

/**
 * Builds a paginated directory-listing response with a `Link` header pointing
 * to `nextUrl` via rel="next" (standard GitHub REST pagination). Omit `nextUrl`
 * for the final page.
 */
export function githubDirListingPage(
  entries: Array<{ name: string; type: string }>,
  nextUrl?: string,
) {
  return {
    ok: true,
    status: 200,
    json: async () => entries,
    headers: mockHeaders(nextUrl ? { Link: `<${nextUrl}>; rel="next"` } : {}),
  };
}

export function setupFetchWithOverrides(
  mockFetch: jest.Mock,
  overrides: Record<string, ReturnType<typeof githubDirListing | typeof githubFileContent | typeof github404>>,
) {
  mockFetch.mockImplementation((url: string) => {
    for (const [pathSuffix, response] of Object.entries(overrides)) {
      if (url === `${API_BASE}/${pathSuffix}` || (pathSuffix === '' && (url === `${API_BASE}/` || url === `${API_BASE}`))) {
        return Promise.resolve(response);
      }
    }
    if (url === `${API_BASE}/` || url === `${API_BASE}`) return Promise.resolve(githubDirListing(ROOT_WITH_ALL_DIRS));
    if (url === `${API_BASE}/.claude/skills`) return Promise.resolve(githubDirListing(SKILLS_WITH_MD));
    if (url === `${API_BASE}/_bmad/_config/manifest.yaml`) return Promise.resolve(githubFileContent(MANIFEST_V6_8));
    return Promise.resolve(github404());
  });
}
