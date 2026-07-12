/**
 * Story 4.3-AC1/AC3/AC4: Dockerfile structure validation
 *
 * Asserts that apps/agent-be/Dockerfile exists and contains the correct
 * multi-stage build structure, Corepack activation, prisma generate before
 * nx build, HEALTHCHECK instruction, EXPOSE, and CMD per the story's ACs.
 *
 * AC coverage:
 * - AC-1: Multi-stage build with Corepack/Yarn, exposes port 3001
 * - AC-3: HEALTHCHECK instruction polls GET /health on 30s interval
 * - AC-4: Prisma generate runs before nx build agent-be
 *
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const dockerfilePath = join(__dirname, '..', 'Dockerfile');

function loadDockerfile(): string {
  if (!existsSync(dockerfilePath)) {
    return '';
  }
  return readFileSync(dockerfilePath, 'utf8');
}

describe('4.3-AC1/AC3/AC4 — Dockerfile structure', () => {
  describe('file existence', () => {
    test('[P0] Dockerfile exists at apps/agent-be/Dockerfile', () => {
      expect(existsSync(dockerfilePath)).toBe(true);
    });
  });

  describe('AC-1: multi-stage build', () => {
    test('[P0] Dockerfile has an install stage (FROM ... AS install)', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/FROM\s+node:24-slim\s+AS\s+install/i);
    });

    test('[P0] Dockerfile has a build stage (FROM ... AS build)', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/FROM\s+node:24-slim\s+AS\s+build/i);
    });

    test('[P0] Dockerfile has a runtime stage (FROM ... AS runtime)', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/FROM\s+node:24-slim\s+AS\s+runtime/i);
    });

    test('[P0] All stages use node:24-slim base image', () => {
      const content = loadDockerfile();
      const fromLines = content.match(/^FROM\s+.+$/gm) ?? [];
      expect(fromLines.length).toBeGreaterThanOrEqual(3);
      fromLines.forEach((line) => {
        expect(line).toMatch(/node:24-slim/i);
      });
    });
  });

  describe('AC-1: Corepack and Yarn', () => {
    test('[P0] Install stage activates Corepack (RUN corepack enable)', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/corepack enable/i);
    });

    test('[P0] Install stage runs yarn install --immutable', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/yarn install --immutable/i);
    });

    test('[P0] Runtime stage runs yarn install (without --immutable)', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/yarn install(?!\s+--immutable)/i);
    });

    test('[P0] Runtime stage activates Yarn 4.17.0 via corepack prepare', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/corepack prepare yarn@4\.17\.0\s+--activate/i);
    });

    test('[P0] Install stage copies .yarnrc.yml for node-modules linker config', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/COPY.*\.yarnrc\.yml/i);
    });

    test('[P0] Runtime stage copies .yarnrc.yml from build stage', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/COPY\s+--from=build.*\.yarnrc\.yml/i);
    });
  });

  describe('AC-4: prisma generate before build', () => {
    test('[P0] Build stage runs database-schemas:generate (prisma generate)', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/database-schemas:generate/);
    });

    test('[P0] Build stage runs nx build agent-be', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/nx build agent-be/);
    });

    test('[P1] Prisma generate runs before nx build agent-be', () => {
      const content = loadDockerfile();
      const generateIndex = content.indexOf('database-schemas:generate');
      const buildIndex = content.indexOf('nx build agent-be');
      expect(generateIndex).toBeGreaterThan(-1);
      expect(buildIndex).toBeGreaterThan(-1);
      expect(generateIndex).toBeLessThan(buildIndex);
    });
  });

  describe('AC-1: runtime image configuration', () => {
    test('[P0] Dockerfile EXPOSEs port 3001', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/EXPOSE\s+3001/);
    });

    test('[P0] CMD is ["node", "main.js"]', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/CMD\s*\[.*["']node["'].*["']main\.js["'].*\]/);
    });

    test('[P0] Runtime stage copies build output from build stage', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/COPY\s+--from=build/i);
    });
  });

  describe('DP-2: runtime dependency merge', () => {
    test('[P0] Runtime stage merges root dependencies into generated package.json', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/root\.dependencies/i);
      expect(content).toMatch(/pkg\.dependencies/i);
    });

    test('[P0] Runtime stage explicitly adds ws: ^8.18.0', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/ws.*8\.18\.0/i);
    });

    test('[P0] Runtime stage copies root yarn.lock for version resolution', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/yarn\.lock/i);
    });
  });

  describe('AC-3: HEALTHCHECK instruction', () => {
    test('[P0] HEALTHCHECK instruction is present', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/HEALTHCHECK/i);
    });

    test('[P0] HEALTHCHECK polls /health (not /api/health)', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/\/health/);
      expect(content).not.toMatch(/\/api\/health/);
    });

    test('[P0] HEALTHCHECK interval is 30s', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/--interval=30s/);
    });

    test('[P0] HEALTHCHECK uses Node.js (no curl install)', () => {
      const content = loadDockerfile();
      expect(content).toMatch(/node\s+-e/);
    });
  });

  describe('AC-1: credential isolation — no secrets baked into image', () => {
    test('[P0] No secret ARG directives in Dockerfile', () => {
      const content = loadDockerfile();
      const secretNames = [
        'ANTHROPIC_API_KEY',
        'DATABASE_URL',
        'CREDENTIAL_ENCRYPTION_KEK',
        'AUTH_SECRET',
        'AUTH_GITHUB_ID',
        'AUTH_GITHUB_SECRET',
        'DAYTONA_API_KEY',
        'DAYTONA_API_URL',
        'RAILWAY_TOKEN',
      ];
      secretNames.forEach((name) => {
        const pattern = new RegExp(`ARG\\s+${name}`, 'i');
        expect(content).not.toMatch(pattern);
      });
    });

    test('[P0] No secret ENV directives in Dockerfile', () => {
      const content = loadDockerfile();
      const secretNames = [
        'ANTHROPIC_API_KEY',
        'DATABASE_URL',
        'CREDENTIAL_ENCRYPTION_KEK',
        'AUTH_SECRET',
        'AUTH_GITHUB_ID',
        'AUTH_GITHUB_SECRET',
        'DAYTONA_API_KEY',
        'DAYTONA_API_URL',
        'RAILWAY_TOKEN',
      ];
      secretNames.forEach((name) => {
        const pattern = new RegExp(`ENV\\s+${name}=`, 'i');
        expect(content).not.toMatch(pattern);
      });
    });
  });
});
