import { CredentialFailureError } from './credential-health';
import { getPrisma } from './prisma';
import {
  fetchGithubContents,
  githubHeaders,
  decodeFileContent,
  detectGithubRateLimit,
  type GithubContentEntry,
} from './repository-validation';
import type { ArtifactType, SyncArtifactsResult } from '@bmad-easy/shared-types';

const BMAD_OUTPUT_ROOT = '_bmad-output';

interface ScannedFile {
  name: string;
  fullPath: string;
  relativePath: string;
}

/**
 * Fetches the last commit date for a file path via the GitHub commits API.
 * Falls back to `new Date()` for any non-critical error (404, non-rate-limit
 * 403, 500, etc.). Only 401 and rate-limit 403 propagate — they affect the
 * entire sync operation.
 */
async function fetchLastCommitDate(
  accessToken: string,
  owner: string,
  repo: string,
  fullPath: string,
): Promise<Date> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?path=${encodeURIComponent(fullPath)}&per_page=1`;
  const response = await fetch(url, {
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
    return new Date();
  }

  if (response.status === 404) {
    return new Date();
  }

  if (!response.ok) {
    return new Date();
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) return new Date();
  const commits = data as Array<{ commit?: { committer?: { date?: string } } }>;
  if (commits.length === 0) return new Date();
  const dateStr = commits[0]?.commit?.committer?.date;
  if (!dateStr) return new Date();
  return new Date(dateStr);
}

/**
 * Recursively scans a directory, collecting all `.md` file paths.
 * Subdirectories are processed sequentially to avoid burst pressure on
 * GitHub's secondary rate limit.
 */
async function scanDirectory(
  accessToken: string,
  owner: string,
  repo: string,
  dirPath: string,
  entries: GithubContentEntry[],
): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  const subdirs: GithubContentEntry[] = [];

  for (const entry of entries) {
    if (entry.type === 'file' && entry.name.endsWith('.md')) {
      if (dirPath === BMAD_OUTPUT_ROOT && entry.name === 'project-context.md') continue;
      const fullPath = `${dirPath}/${entry.name}`;
      const relativePath = fullPath.slice(BMAD_OUTPUT_ROOT.length + 1);
      files.push({ name: entry.name, fullPath, relativePath });
    } else if (entry.type === 'dir') {
      subdirs.push(entry);
    }
  }

  for (const subdir of subdirs) {
    const subdirPath = `${dirPath}/${subdir.name}`;
    const subdirResult = await fetchGithubContents(accessToken, owner, repo, subdirPath);
    if (subdirResult !== null && Array.isArray(subdirResult)) {
      const subFiles = await scanDirectory(accessToken, owner, repo, subdirPath, subdirResult);
      files.push(...subFiles);
    }
  }

  return files;
}

function parseFrontmatterTitle(content: string): string | null {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  const frontmatter = fmMatch[1];
  const titleMatch = frontmatter.match(/^title:\s*(.+?)\s*$/m);
  if (!titleMatch) return null;
  let title = titleMatch[1];
  if (
    (title.startsWith('"') && title.endsWith('"') && title.length >= 2) ||
    (title.startsWith("'") && title.endsWith("'") && title.length >= 2)
  ) {
    title = title.slice(1, -1);
  }
  return title;
}

function parseHeadingTitle(content: string): string | null {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const match = withoutFrontmatter.match(/^#\s+(.+?)\s*$/m);
  return match?.[1] ?? null;
}

function deriveTitleFromPath(relativePath: string): string {
  const segments = relativePath.split('/');
  const filename = segments[segments.length - 1];
  const title = filename.replace(/\.md$/, '');
  return title || 'Untitled';
}

function extractTitle(content: string, relativePath: string): string {
  const fmTitle = parseFrontmatterTitle(content);
  if (fmTitle) return fmTitle;

  const headingTitle = parseHeadingTitle(content);
  if (headingTitle) return headingTitle;

  return deriveTitleFromPath(relativePath);
}

function deriveArtifactType(relativePath: string): ArtifactType {
  if (relativePath.startsWith('brainstorming/')) return 'brainstorming';
  if (relativePath.startsWith('planning-artifacts/prds/')) return 'prd';
  if (relativePath.startsWith('planning-artifacts/architecture/') || relativePath === 'planning-artifacts/architecture.md') return 'architecture';
  if (relativePath.startsWith('planning-artifacts/epics/') || relativePath === 'planning-artifacts/epics.md') return 'epics';
  if (relativePath.startsWith('planning-artifacts/ux-designs/')) return 'ux';
  if (relativePath.startsWith('planning-artifacts/research/')) {
    const filename = relativePath.split('/').pop() ?? '';
    if (filename.startsWith('technical-')) return 'technical-research';
    if (filename.startsWith('market-')) return 'market-research';
    if (filename.startsWith('domain-')) return 'domain-research';
    return 'other';
  }
  if (relativePath.startsWith('planning-artifacts/briefs/')) return 'product-brief';
  if (relativePath.startsWith('planning-artifacts/prfaq/')) return 'prfaq';
  if (relativePath.startsWith('implementation-artifacts/')) return 'epics';
  if (relativePath.startsWith('test-artifacts/')) return 'test-arch';
  return 'other';
}

interface FileFetchData {
  file: ScannedFile;
  content: string;
  commitDate: Date;
}

async function fetchFileData(
  accessToken: string,
  owner: string,
  repo: string,
  file: ScannedFile,
): Promise<FileFetchData | null> {
  const [contentResult, commitResult] = await Promise.allSettled([
    fetchGithubContents(accessToken, owner, repo, file.fullPath),
    fetchLastCommitDate(accessToken, owner, repo, file.fullPath).catch(
      () => new Date(),
    ),
  ]);

  if (contentResult.status === 'rejected') {
    throw contentResult.reason;
  }

  const contentResponse = contentResult.value;

  if (contentResponse === null || Array.isArray(contentResponse)) {
    return null;
  }

  const commitDate =
    commitResult.status === 'fulfilled' ? commitResult.value : new Date();

  return {
    file,
    content: decodeFileContent(contentResponse),
    commitDate,
  };
}

/**
 * Scans `_bmad-output/` via the GitHub Contents API and upserts artifact
 * metadata and content into Postgres.
 *
 * NOT a Server Action — this module must never carry 'use server'. It receives
 * a plaintext OAuth token and performs no session check, so exposing it as a
 * network-callable endpoint would let anonymous callers relay arbitrary tokens
 * through this server. Only authenticated Server Actions may call it.
 */
export async function syncArtifacts(
  accessToken: string,
  owner: string,
  repo: string,
  repoConnectionId: string,
): Promise<SyncArtifactsResult> {
  const rootResult = await fetchGithubContents(accessToken, owner, repo, BMAD_OUTPUT_ROOT);

  if (rootResult === null || !Array.isArray(rootResult)) {
    return {
      error: 'Could not access the _bmad-output/ directory in the repository.',
      errorCode: 'NOT_FOUND',
    };
  }

  const scannedFiles = await scanDirectory(accessToken, owner, repo, BMAD_OUTPUT_ROOT, rootResult);

  const fetchResults = await Promise.allSettled(
    scannedFiles.map((file) => fetchFileData(accessToken, owner, repo, file)),
  );

  const scannedPaths = scannedFiles.map((f) => f.relativePath);

  const { artifactsUpserted, artifactsDeleted } = await getPrisma().$transaction(async (tx) => {
    let upserted = 0;

    for (const result of fetchResults) {
      if (result.status === 'rejected') {
        throw result.reason;
      }

      const data = result.value;
      if (data === null) continue;

      const { file, content, commitDate } = data;
      const title = extractTitle(content, file.relativePath);
      const type = deriveArtifactType(file.relativePath);

      await tx.artifact.upsert({
        where: { repoConnectionId_path: { repoConnectionId, path: file.relativePath } },
        create: {
          repoConnectionId,
          path: file.relativePath,
          type,
          title,
          status: 'completed',
          lastModifiedAt: commitDate,
          content,
        },
        update: {
          type,
          title,
          lastModifiedAt: commitDate,
          content,
        },
      });

      upserted++;
    }

    const deleteResult = await tx.artifact.deleteMany({
      where: {
        repoConnectionId,
        path: { notIn: scannedPaths },
      },
    });

    return { artifactsUpserted: upserted, artifactsDeleted: deleteResult.count };
  });

  return { success: true, artifactsUpserted, artifactsDeleted };
}
