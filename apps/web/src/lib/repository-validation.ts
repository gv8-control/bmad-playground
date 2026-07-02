import { CredentialFailureError } from './credential-health';
import {
  BMAD_DOCUMENTATION_LINK,
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

interface GithubContentEntry {
  name: string;
  type: string;
}

interface GithubFileContent {
  content: string;
  encoding: string;
}

function githubHeaders(accessToken: string): HeadersInit {
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

async function fetchGithubContents(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
): Promise<GithubContentEntry[] | GithubFileContent | null> {
  const response = await fetch(githubApiUrl(owner, repo, path), {
    signal: AbortSignal.timeout(10_000),
    headers: githubHeaders(accessToken),
  });

  if (response.status === 401 || response.status === 403) {
    throw new CredentialFailureError(response.status);
  }

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status} for path: ${path}`);
  }

  return (await response.json()) as GithubContentEntry[] | GithubFileContent;
}

function decodeFileContent(file: GithubFileContent): string {
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

// ─── Validation Result Cache ──────────────────────────────────────────────────
// Short-lived in-memory cache to avoid redundant GitHub API calls for the same
// user validating the same repo within a short window (~120s). Only successful
// results are cached — a user who fixes their repo must not be served a stale
// failure. Bounded FIFO to keep a long-lived process from growing unboundedly.

interface ValidationCacheEntry {
  result: ValidationResult;
  expiresAt: number;
}

const validationCache = new Map<string, ValidationCacheEntry>();
const CACHE_TTL_MS = 120_000;
const CACHE_MAX_ENTRIES = 500;

function cacheKey(userId: string, owner: string, repo: string): string {
  return `${userId}:${owner}/${repo}`;
}

export function getCachedValidation(
  userId: string,
  owner: string,
  repo: string,
): ValidationResult | undefined {
  const key = cacheKey(userId, owner, repo);
  const entry = validationCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    validationCache.delete(key);
    return undefined;
  }
  return entry.result;
}

export function cacheValidation(
  userId: string,
  owner: string,
  repo: string,
  result: ValidationResult,
  ttlMs: number = CACHE_TTL_MS,
): void {
  const key = cacheKey(userId, owner, repo);
  if (!validationCache.has(key) && validationCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = validationCache.keys().next().value;
    if (oldest !== undefined) validationCache.delete(oldest);
  }
  validationCache.set(key, { result, expiresAt: Date.now() + ttlMs });
}

export function invalidateValidationCache(userId: string, repoUrl: string): void {
  const cleaned = repoUrl.replace(/\.git\/?$/, '').replace(/\/$/, '');
  const match = cleaned.match(
    /^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/,
  );
  if (match) {
    validationCache.delete(cacheKey(userId, match[1], match[2]));
  }
}

export function clearValidationCache(): void {
  validationCache.clear();
}
