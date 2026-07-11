import { Injectable, Logger } from '@nestjs/common';
import type {
  ToolCallPromotedEvent,
  CredentialFailureEvent,
  AccessDeniedEvent,
  AccessDeniedCode,
} from '@bmad-easy/shared-types';
import {
  TOOL_CALL_PROMOTED_EVENT,
  CREDENTIAL_FAILURE_EVENT,
  ACCESS_DENIED_EVENT,
} from '@bmad-easy/shared-types';
import type { ArtifactType } from '@bmad-easy/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';

const BMAD_OUTPUT_PREFIX = '_bmad-output/';

const GIT_REMOTE_COMMAND = /\bgit\s+(?:push|fetch|pull|clone|ls-remote)\b/;

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

function deriveTitleFromPath(relativePath: string): string {
  const segments = relativePath.split('/');
  const filename = segments[segments.length - 1];
  const title = filename.replace(/\.md$/, '');
  return title || 'Untitled';
}

function isFailedCommit(output: string): boolean {
  if (/^error:/m.test(output)) return true;
  if (/Command exited with code [1-9]/.test(output)) return true;
  if (/failed to push/i.test(output)) return true;
  return false;
}

function isSuccessfulCommit(output: string): boolean {
  if (/^\[main\s+\w+\]/m.test(output)) return true;
  if (/^\[\S+\s+\w+\]/m.test(output)) return true;
  if (/files? changed/i.test(output)) return true;
  return false;
}

function extractBmadArtifactPaths(output: string): string[] {
  const paths: string[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const createMatch = line.match(/create mode \d+ (.+)/);
    if (createMatch && createMatch[1].startsWith(BMAD_OUTPUT_PREFIX)) {
      paths.push(createMatch[1].trim());
      continue;
    }
    const diffMatch = line.match(/^\s*(\S+_bmad-output\/\S+)/);
    if (diffMatch) {
      const raw = diffMatch[1];
      const idx = raw.indexOf(BMAD_OUTPUT_PREFIX);
      if (idx >= 0) {
        paths.push(raw.slice(idx));
      }
      continue;
    }
    const genericMatch = line.match(/(_bmad-output\/[^\s]+)/);
    if (genericMatch) {
      paths.push(genericMatch[1]);
    }
  }
  return [...new Set(paths)];
}

function isCredentialFailureOutput(output: string): boolean {
  if (/remote: Invalid username or token/i.test(output)) return true;
  if (/remote: Anonymous authentication/i.test(output)) return true;
  if (/fatal: Authentication failed for/i.test(output)) return true;
  if (/fatal: could not read Username for/i.test(output)) return true;
  if (/\b401\s+Unauthorized\b/i.test(output)) return true;
  return false;
}

function classifyAccessDenied(output: string): { code: AccessDeniedCode; retryAfter?: number } | null {
  if (!/\b403\b|Permission denied|Resource not accessible by integration|Rate limit/i.test(output)) {
    return null;
  }

  if (/Rate limit exceeded/i.test(output) || /secondary rate limit/i.test(output) || /abuse detection/i.test(output)) {
    const waitMatch = output.match(/retry after (\d+)/i);
    const retryAfter = waitMatch
      ? Math.min(Math.max(Math.trunc(Number(waitMatch[1])), 1), 3600)
      : undefined;
    return { code: 'RATE_LIMITED', retryAfter };
  }

  if (/Resource not accessible by integration/i.test(output) || /org.*policy/i.test(output)) {
    return { code: 'ORG_RESTRICTION' };
  }

  return { code: 'INSUFFICIENT_PERMISSION' };
}

@Injectable()
export class ToolPillClassifierService {
  private readonly logger = new Logger(ToolPillClassifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: CredentialsService,
  ) {}

  async classifyToolResult(
    toolCallId: string,
    toolName: string,
    toolInput: string,
    toolOutput: string,
    userId: string,
  ): Promise<ToolCallPromotedEvent | CredentialFailureEvent | AccessDeniedEvent | null> {
    if (toolName === 'Bash' && GIT_REMOTE_COMMAND.test(toolInput)) {
      if (isCredentialFailureOutput(toolOutput)) {
        await this.credentialsService.markCredentialFailed(userId, new Date());
        return {
          type: CREDENTIAL_FAILURE_EVENT,
          toolCallId,
        };
      }

      const accessDenied = classifyAccessDenied(toolOutput);
      if (accessDenied) {
        return {
          type: ACCESS_DENIED_EVENT,
          toolCallId,
          code: accessDenied.code,
          retryAfter: accessDenied.retryAfter,
        };
      }
    }

    if (toolName !== 'Bash' || !toolInput.includes('git commit')) {
      return null;
    }

    if (isFailedCommit(toolOutput)) {
      return null;
    }

    if (!isSuccessfulCommit(toolOutput)) {
      return null;
    }

    const bmadPaths = extractBmadArtifactPaths(toolOutput);
    if (bmadPaths.length === 0) {
      return null;
    }

    const fullPath = bmadPaths[0];
    const relativePath = fullPath.slice(BMAD_OUTPUT_PREFIX.length);
    const pathArtifactType = deriveArtifactType(relativePath);
    const pathArtifactTitle = deriveTitleFromPath(relativePath);

    let artifactId: string | null = null;
    let artifactType = pathArtifactType;
    let artifactTitle = pathArtifactTitle;
    let viewHref = '/artifacts';

    try {
      const repoConnection = await this.prisma.repoConnection.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (repoConnection) {
        const artifact = await this.prisma.artifact.findFirst({
          where: { repoConnectionId: repoConnection.id, path: relativePath },
          select: { id: true, title: true, type: true },
        });

        if (artifact) {
          artifactId = artifact.id;
          artifactType = artifact.type as ArtifactType;
          artifactTitle = artifact.title;
          viewHref = `/artifacts?id=${artifact.id}`;
        }
      }
    } catch (err) {
      this.logger.warn(
        `Postgres lookup failed for artifact path "${relativePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      type: TOOL_CALL_PROMOTED_EVENT,
      toolCallId,
      artifactType,
      artifactTitle,
      artifactId,
      viewHref,
    };
  }
}
