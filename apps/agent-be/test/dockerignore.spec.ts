/**
 * Story 4.3-AC1: .dockerignore validation
 *
 * Asserts that .dockerignore exists at the repo root and excludes the
 * required patterns to prevent secrets, build artifacts, and unnecessary
 * files from entering the Docker build context.
 *
 * AC coverage:
 * - AC-1: .dockerignore excludes node_modules, .git, dist, .env*, etc.
 *
 * Credential isolation invariant: .env files must never enter the build
 * context — this is the primary security boundary for Docker builds.
 *
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const dockerignorePath = join(__dirname, '..', '..', '..', '.dockerignore');

function loadDockerignore(): string {
  if (!existsSync(dockerignorePath)) {
    return '';
  }
  return readFileSync(dockerignorePath, 'utf8');
}

describe('4.3-AC1 — .dockerignore', () => {
  describe('file existence', () => {
    test('[P0] .dockerignore exists at repo root', () => {
      expect(existsSync(dockerignorePath)).toBe(true);
    });
  });

  describe('credential isolation — secrets excluded from build context', () => {
    test('[P0] .dockerignore excludes .env files', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^\.env/m);
    });

    test('[P0] .dockerignore re-includes .env.example (template preserved)', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^!\.env\.example$/m);
    });
  });

  describe('build artifacts excluded', () => {
    test('[P0] .dockerignore excludes node_modules/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^node_modules\/?$/m);
    });

    test('[P0] .dockerignore excludes .git/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^\.git\/?$/m);
    });

    test('[P0] .dockerignore excludes dist/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^dist\/?$/m);
    });

    test('[P0] .dockerignore excludes .nx/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^\.nx\/?$/m);
    });

    test('[P0] .dockerignore excludes .next/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^\.next\/?$/m);
    });

    test('[P0] .dockerignore excludes out/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^out\/?$/m);
    });
  });

  describe('generated code excluded', () => {
    test('[P0] .dockerignore excludes libs/database-schemas/src/generated/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/libs\/database-schemas\/src\/generated/);
    });
  });

  describe('test artifacts excluded', () => {
    test('[P0] .dockerignore excludes playwright-report/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^playwright-report\/?$/m);
    });

    test('[P0] .dockerignore excludes test-results/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^test-results\/?$/m);
    });
  });

  describe('deployment config excluded', () => {
    test('[P0] .dockerignore excludes .vercel/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^\.vercel\/?$/m);
    });

    test('[P0] .dockerignore excludes .railway/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^\.railway\/?$/m);
    });
  });

  describe('BMAD and docs excluded', () => {
    test('[P0] .dockerignore excludes .claude/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^\.claude\/?$/m);
    });

    test('[P0] .dockerignore excludes _bmad-output/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^_bmad-output\/?$/m);
    });

    test('[P0] .dockerignore excludes docs/', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^docs\/?$/m);
    });

    test('[P0] .dockerignore excludes *.md files', () => {
      const content = loadDockerignore();
      expect(content).toMatch(/^\*\.md$/m);
    });
  });
});
