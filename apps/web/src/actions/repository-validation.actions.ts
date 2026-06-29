'use server';

import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { decryptToken } from '@/lib/crypto';
import { z } from 'zod';
import {
  BMAD_DOCUMENTATION_LINK,
  type ValidateRepositoryResult,
  type ValidationError,
  type ValidationResult,
} from '@bmad-easy/shared-types';

const repoUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .regex(
    /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?\/?$/,
    'Must be a GitHub repository URL (e.g. https://github.com/owner/repo)',
  );

const REQUIRED_DIRS = ['_bmad/', '_bmad-output/', '.claude/'] as const;

const VERSION_FILE_PATHS = [
  '_bmad/_config/manifest.yaml',
  '_bmad/core/config.yaml',
  '_bmad/package.json',
] as const;

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
  return `https://api.github.com/repos/${owner}/${repo}/contents${cleanPath}`;
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
  const match = content.match(/^\s*version:\s*(\d+\.\d+\.\d+)/m);
  return match?.[1] ?? null;
}

function parseVersionFromConfigYaml(content: string): string | null {
  const match = content.match(/#\s*Version:\s*(\d+\.\d+\.\d+)/);
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
    (async (): Promise<string> => {
      const result = await fetchGithubContents(accessToken, owner, repo, path);
      if (result && !Array.isArray(result)) {
        const content = decodeFileContent(result);
        const version = parsers[i](content);
        if (version) return version;
      }
      throw new Error(`No version found in ${path}`);
    })(),
  );

  try {
    return await Promise.any(probes);
  } catch {
    return null;
  }
}

function isVersion6x(version: string): boolean {
  const match = version.match(/^(\d+)\./);
  if (!match) return false;
  return parseInt(match[1], 10) === 6;
}

function makeValidationError(
  code: ValidationError['code'],
  message: string,
  meta: ValidationError['meta'],
): ValidationError {
  return { code, message, meta: { documentationLink: BMAD_DOCUMENTATION_LINK, ...meta } };
}

export async function inspectBmadSetup(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<ValidateRepositoryResult> {
  const [rootResult, skillsResult, version] = await Promise.all([
    fetchGithubContents(accessToken, owner, repo, ''),
    fetchGithubContents(accessToken, owner, repo, '.claude/skills'),
    detectBmadVersion(accessToken, owner, repo),
  ]);

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

  if (missing.length > 0) {
    return makeValidationError(
      'MISSING_DIRECTORY',
      `BMAD initialization is incomplete. Missing prerequisite directory: ${missing.join(', ')}. See BMAD documentation to set up your repository.`,
      { missing },
    );
  }

  if (!version || !isVersion6x(version)) {
    const detected = version ?? 'unknown';
    return makeValidationError(
      'UNSUPPORTED_VERSION',
      `BMAD version ${detected} is not supported. Only BMAD v6 is supported. See BMAD documentation to upgrade.`,
      { detectedVersion: detected },
    );
  }

  const skillsEntries = Array.isArray(skillsResult) ? skillsResult : [];
  const skillsCount = skillsEntries.filter(
    (e) => e.type === 'file' && e.name.endsWith('.md'),
  ).length;

  if (skillsCount === 0) {
    const hasDir = skillsResult !== null;
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

type ActionError = {
  errorCode: 'INVALID_URL' | 'NO_CREDENTIAL' | 'UNKNOWN';
  error: string;
};

type ValidateRepositoryActionResult =
  | ValidationResult
  | ValidationError
  | ActionError;

// ─── Validation Result Cache ──────────────────────────────────────────────────
// Short-lived in-memory cache to avoid redundant GitHub API calls for the same
// user validating the same repo within a short window (~120s).

interface ValidationCacheEntry {
  result: ValidateRepositoryActionResult;
  expiresAt: number;
}

const validationCache = new Map<string, ValidationCacheEntry>();
const CACHE_TTL_MS = 120_000;

function cacheKey(userId: string, owner: string, repo: string): string {
  return `${userId}:${owner}/${repo}`;
}

function cacheGet(key: string): ValidateRepositoryActionResult | undefined {
  const entry = validationCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    validationCache.delete(key);
    return undefined;
  }
  return entry.result;
}

function cacheSet(
  key: string,
  result: ValidateRepositoryActionResult,
  ttlMs: number = CACHE_TTL_MS,
): void {
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

export async function validateRepository(
  repoUrl: string,
): Promise<ValidateRepositoryActionResult> {
  const parsed = repoUrlSchema.safeParse(repoUrl.trim());
  if (!parsed.success) {
    return {
      error: 'Must be a GitHub repository URL (e.g. https://github.com/owner/repo)',
      errorCode: 'INVALID_URL',
    };
  }
  const cleanUrl = parsed.data.replace(/\.git\/?$/, '').replace(/\/$/, '');

  const session = await auth();
  if (!session?.userId) {
    return { error: 'Not authenticated', errorCode: 'UNKNOWN' };
  }

  const credential = await getPrisma().oAuthCredential.findUnique({
    where: { userId: session.userId },
  });
  if (!credential) {
    return {
      error: 'No OAuth credential found. Please sign out and sign in again.',
      errorCode: 'NO_CREDENTIAL',
    };
  }

  try {
    const accessToken = decryptToken(credential);

    const match = cleanUrl.match(/^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/);
    if (!match) {
      return {
        error: 'Invalid GitHub repository URL format',
        errorCode: 'INVALID_URL',
      };
    }
    const [, owner, repo] = match;

    const key = cacheKey(session.userId, owner, repo);
    const cached = cacheGet(key);
    if (cached) return cached;

    const result = await inspectBmadSetup(accessToken, owner, repo);
    cacheSet(key, result);
    return result;
  } catch (err) {
    console.error('[validateRepository] Unexpected error:', err);
    return {
      error: 'An unexpected error occurred during validation. Please try again.',
      errorCode: 'UNKNOWN',
    };
  }
}
