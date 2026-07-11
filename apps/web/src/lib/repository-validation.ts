import { CredentialFailureError } from './credential-health';
import {
  BMAD_DOCUMENTATION_LINK,
  RATE_LIMITED_MESSAGE,
  type ValidateRepositoryResult,
  type ValidationError,
  type ValidationResult,
} from '@bmad-easy/shared-types';

const REQUIRED_DIRS = ['_bmad/', '_bmad-output/', '.claude/'] as const;

const VERSION_FILE_PATHS = [
  '_bmad/_config/manifest.yaml',
  '_bmad/core/config.yaml',
  '_bmad/package.json',
] as const;

/** Well-known repo-hygiene files that are not Skills even though they are .md. */
const NON_SKILL_MD_FILES = new Set([
  'readme.md',
  'changelog.md',
  'contributing.md',
  'license.md',
]);

export interface GithubContentEntry {
  name: string;
  type: string;
}

export interface GithubFileContent {
  content: string;
  encoding: string;
}

/** Hard caps for directory-listing pagination — protects against pathological repos. */
export const MAX_CONTENT_PAGES = 10;
export const MAX_CONTENT_ENTRIES = 10_000;

/** Bounded in-memory cache for GitHub Contents API responses. */
const GITHUB_CACHE_MAX_ENTRIES = 500;
const GITHUB_CACHE_TTL_MS = 120_000;

interface CacheEntry {
  value: GithubContentEntry[] | GithubFileContent | null;
  expiresAt: number;
}

const githubApiCache = new Map<string, CacheEntry>();

function githubCacheKey(owner: string, repo: string, path: string): string {
  return `${owner}/${repo}/${path}`;
}

function getCached(key: string): GithubContentEntry[] | GithubFileContent | null | undefined {
  const entry = githubApiCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    githubApiCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(key: string, value: GithubContentEntry[] | GithubFileContent | null): void {
  if (githubApiCache.size >= GITHUB_CACHE_MAX_ENTRIES) {
    const oldestKey = githubApiCache.keys().next().value;
    if (oldestKey !== undefined) githubApiCache.delete(oldestKey);
  }
  githubApiCache.set(key, { value, expiresAt: Date.now() + GITHUB_CACHE_TTL_MS });
}

/** Clears all cached GitHub Contents API responses. Intended for test isolation. */
export function clearGithubCache(): void {
  githubApiCache.clear();
}

/**
 * Thrown when a 403 is a GitHub rate limit (primary or secondary), not a
 * credential failure. Callers must NOT call markCredentialFailed for this.
 */
export class RateLimitError extends Error {
  constructor(public readonly waitHintSeconds?: number) {
    super('GitHub API rate limit reached');
    this.name = 'RateLimitError';
  }
}

/**
 * Detects whether a 403 response is a GitHub rate limit rather than a
 * genuine credential/permission failure.
 *
 * - Primary rate limit: `X-RateLimit-Remaining: 0` response header.
 * - Secondary rate limit / abuse detection: response body message mentions
 *   "secondary rate limit" or "abuse detection".
 *
 * When rate-limited, also derives an optional wait-time hint (seconds) from
 * `Retry-After` or `X-RateLimit-Reset`, if present — omitted otherwise.
 */
export function detectGithubRateLimit(
  response: Response,
  body: { message?: string } | undefined,
): RateLimitError | null {
  const remaining = response.headers?.get('X-RateLimit-Remaining');
  const isPrimaryRateLimit = remaining === '0';

  const message = (body?.message ?? '').toLowerCase();
  const isSecondaryRateLimit =
    message.includes('secondary rate limit') || message.includes('abuse detection');

  if (!isPrimaryRateLimit && !isSecondaryRateLimit) {
    return null;
  }

  const retryAfter = response.headers?.get('Retry-After');
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return new RateLimitError(parseInt(retryAfter, 10));
  }

  const resetAt = response.headers?.get('X-RateLimit-Reset');
  if (resetAt && /^\d+$/.test(resetAt)) {
    const waitSeconds = parseInt(resetAt, 10) - Math.floor(Date.now() / 1000);
    if (waitSeconds > 0) {
      return new RateLimitError(waitSeconds);
    }
  }

  return new RateLimitError();
}

/**
 * Builds the user-facing message for a RateLimitError, appending a wait-time
 * hint only when one was cleanly derivable from GitHub's response headers.
 */
export function rateLimitMessage(err: RateLimitError): string {
  if (!err.waitHintSeconds || err.waitHintSeconds <= 0) {
    return RATE_LIMITED_MESSAGE;
  }
  const minutes = Math.ceil(err.waitHintSeconds / 60);
  return `${RATE_LIMITED_MESSAGE} (about ${minutes} minute${minutes === 1 ? '' : 's'})`;
}

export function githubHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function githubApiUrl(owner: string, repo: string, path: string): string {
  const cleanPath = path ? `/${path}` : '';
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${cleanPath}`;
}

/** Extracts the `rel="next"` URL from a standard GitHub `Link` response header, if present. */
function parseNextLink(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

export async function fetchGithubContents(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
): Promise<GithubContentEntry[] | GithubFileContent | null> {
  const cacheKey = githubCacheKey(owner, repo, path);
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  const response = await fetch(githubApiUrl(owner, repo, path), {
    signal: AbortSignal.timeout(10_000),
    headers: githubHeaders(accessToken),
  });

  if (response.status === 401) {
    throw new CredentialFailureError(401);
  }

  if (response.status === 403) {
    const body = await response.json().catch(() => undefined);
    const rateLimit = detectGithubRateLimit(response, body);
    if (rateLimit) throw rateLimit;
    // Not a credential failure — the token is valid but lacks access to this
    // resource (org-restriction, permission-denied, etc.). Return null so the
    // caller handles it as an inaccessible path without marking the credential
    // as failed.
    return null;
  }

  if (response.status === 404) {
    setCached(cacheKey, null);
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status} for path: ${path}`);
  }

  const data = (await response.json()) as GithubContentEntry[] | GithubFileContent;

  if (!Array.isArray(data)) {
    setCached(cacheKey, data);
    return data;
  }

  // Directory listing — GitHub silently truncates large directories without
  // pagination. Follow the Link header's rel="next" until exhausted or capped.
  let entries = data;
  let nextUrl = parseNextLink(response.headers?.get('Link'));
  let pageCount = 1;

  while (nextUrl && pageCount < MAX_CONTENT_PAGES && entries.length < MAX_CONTENT_ENTRIES) {
    const nextResponse = await fetch(nextUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: githubHeaders(accessToken),
    });

    if (nextResponse.status === 401) {
      throw new CredentialFailureError(401);
    }

    if (nextResponse.status === 403) {
      const nextBody = await nextResponse.json().catch(() => undefined);
      const rateLimit = detectGithubRateLimit(nextResponse, nextBody);
      if (rateLimit) throw rateLimit;
      return null;
    }

    if (!nextResponse.ok) {
      throw new Error(`GitHub API error ${nextResponse.status} for path: ${path}`);
    }

    const nextEntries = (await nextResponse.json()) as GithubContentEntry[];
    entries = entries.concat(nextEntries);
    pageCount += 1;
    nextUrl = parseNextLink(nextResponse.headers?.get('Link'));
  }

  setCached(cacheKey, entries);
  return entries;
}

export function decodeFileContent(file: GithubFileContent): string {
  if (file.encoding === 'base64') {
    return Buffer.from(file.content, 'base64').toString('utf8');
  }
  return file.content;
}

function parseVersionFromManifest(content: string): string | null {
  const match = content.match(/^\s*version:\s*['"]?v?(\d+\.\d+\.\d+)/m);
  return match?.[1] ?? null;
}

function parseVersionFromConfigYaml(content: string): string | null {
  const match = content.match(/#\s*Version:\s*v?(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

function parseVersionFromPackageJson(content: string): string | null {
  try {
    const pkg = JSON.parse(content) as { version?: string };
    if (pkg.version && /^\d+\.\d+\.\d+$/.test(pkg.version)) {
      return pkg.version;
    }
  } catch {
    // malformed JSON
  }
  return null;
}

async function detectBmadVersion(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<string | null> {
  const parsers = [
    parseVersionFromManifest,
    parseVersionFromConfigYaml,
    parseVersionFromPackageJson,
  ];

  const probes = VERSION_FILE_PATHS.map((path, i) =>
    (async (): Promise<string | null> => {
      const result = await fetchGithubContents(accessToken, owner, repo, path);
      if (result && !Array.isArray(result)) {
        const content = decodeFileContent(result);
        return parsers[i](content);
      }
      return null;
    })(),
  );

  const settled = await Promise.allSettled(probes);

  // Sources are consulted in priority order (manifest → config.yaml → package.json),
  // never by response timing. A failed higher-priority probe must not be silently
  // skipped: "no version found" may only be concluded from clean 404s/parse misses.
  for (const outcome of settled) {
    if (outcome.status === 'rejected') throw outcome.reason;
    if (outcome.value) return outcome.value;
  }

  return null;
}

async function countSkills(
  accessToken: string,
  owner: string,
  repo: string,
  entries: GithubContentEntry[],
): Promise<number> {
  const flatMdCount = entries.filter(
    (e) =>
      e.type === 'file' &&
      e.name.endsWith('.md') &&
      !NON_SKILL_MD_FILES.has(e.name.toLowerCase()),
  ).length;
  const dirEntries = entries.filter((e) => e.type === 'dir');
  const dirChecks = await Promise.all(
    dirEntries.map((d) =>
      fetchGithubContents(accessToken, owner, repo, `.claude/skills/${encodeURIComponent(d.name)}/SKILL.md`),
    ),
  );
  const dirSkillCount = dirChecks.filter((r) => r !== null && !Array.isArray(r)).length;
  return flatMdCount + dirSkillCount;
}

function isVersion6x(version: string): boolean {
  const match = version.match(/^(\d+)\./);
  if (!match) return false;
  return parseInt(match[1], 10) === 6;
}

function makeValidationError(
  code: ValidationError['code'],
  message: string,
  meta: Omit<ValidationError['meta'], 'documentationLink'>,
): ValidationError {
  return { code, message, meta: { ...meta, documentationLink: BMAD_DOCUMENTATION_LINK } };
}

/**
 * Server-side BMAD setup inspection (Story 1.4).
 *
 * NOT a Server Action — this module must never carry 'use server'. It receives
 * a plaintext OAuth token and performs no session check, so exposing it as a
 * network-callable endpoint would let anonymous callers relay arbitrary tokens
 * through this server. Only authenticated Server Actions may call it.
 */
export async function inspectBmadSetup(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<ValidateRepositoryResult> {
  const rootResult = await fetchGithubContents(accessToken, owner, repo, '');
  const rootEntries = Array.isArray(rootResult) ? rootResult : [];
  const rootDirNames = new Set(
    rootEntries.filter((e) => e.type === 'dir').map((e) => e.name),
  );

  const missing: string[] = [];
  for (const dir of REQUIRED_DIRS) {
    const dirName = dir.replace(/\/$/, '');
    if (!rootDirNames.has(dirName)) {
      missing.push(dir);
    }
  }

  // Directory check settles first: it needs no further API calls, and a
  // transient failure in the skills/version probes must not mask this verdict.
  if (missing.length > 0) {
    console.info(
      '[repository:validation] MISSING_DIRECTORY for %s/%s: %s',
      owner,
      repo,
      missing.join(', '),
    );
    return makeValidationError(
      'MISSING_DIRECTORY',
      `BMAD initialization is incomplete. Missing prerequisite directory: ${missing.join(', ')}. See BMAD documentation to set up your repository.`,
      { missing },
    );
  }

  const [skillsResult, version] = await Promise.all([
    fetchGithubContents(accessToken, owner, repo, '.claude/skills'),
    detectBmadVersion(accessToken, owner, repo),
  ]);

  if (!version || !isVersion6x(version)) {
    const detected = version ?? 'unknown';
    console.info(
      '[repository:validation] UNSUPPORTED_VERSION for %s/%s: %s',
      owner,
      repo,
      detected,
    );
    return makeValidationError(
      'UNSUPPORTED_VERSION',
      `BMAD version ${detected} is not supported. Only BMAD v6 is supported. See BMAD documentation to upgrade.`,
      { detectedVersion: detected },
    );
  }

  const skillsEntries = Array.isArray(skillsResult) ? skillsResult : [];
  const skillsCount = await countSkills(accessToken, owner, repo, skillsEntries);

  if (skillsCount === 0) {
    const hasDir = skillsResult !== null;
    console.info(
      '[repository:validation] NO_SKILLS_FOUND for %s/%s (skills dir %s)',
      owner,
      repo,
      hasDir ? 'empty' : 'absent',
    );
    const message = hasDir
      ? 'No BMAD Skills were found in .claude/skills/. See BMAD documentation to install Skills.'
      : 'No Skills directory was found at .claude/skills/. See BMAD documentation to set up Skills.';
    return makeValidationError('NO_SKILLS_FOUND', message, {});
  }

  const success: ValidationResult = {
    valid: true,
    repositoryUrl: `https://github.com/${owner}/${repo}`,
    bmadVersion: version,
    skillsCount,
    checkedAt: new Date().toISOString(),
  };

  return success;
}
