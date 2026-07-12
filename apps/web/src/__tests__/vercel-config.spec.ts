/**
 * Story 4.1-AC1/AC2: vercel.json project configuration validation
 *
 * Asserts that apps/web/vercel.json exists and contains the correct
 * Vercel project configuration per the story's acceptance criteria.
 *
 * AC coverage:
 * - AC-1: framework preset, installCommand, buildCommand (prisma generate + nx build web)
 * - AC-2: git.deploymentEnabled: false
 * - AC-1 (secondary): $schema for IDE validation
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const vercelJsonPath = join(__dirname, '..', '..', 'vercel.json');

function loadVercelConfig(): Record<string, unknown> {
  if (!existsSync(vercelJsonPath)) {
    return {};
  }
  return JSON.parse(readFileSync(vercelJsonPath, 'utf8'));
}

describe('4.1-AC1/AC2 — vercel.json project configuration', () => {
  describe('file existence', () => {
    test('[P0] vercel.json exists at apps/web/vercel.json', () => {
      expect(existsSync(vercelJsonPath)).toBe(true);
    });
  });

  describe('AC-1: framework preset', () => {
    test('[P0] framework is set to "nextjs"', () => {
      const config = loadVercelConfig();
      expect(config.framework).toBe('nextjs');
    });
  });

  describe('AC-1: install command', () => {
    test('[P0] installCommand is "yarn install --immutable"', () => {
      const config = loadVercelConfig();
      expect(config.installCommand).toBe('yarn install --immutable');
    });
  });

  describe('AC-1: build command includes prisma generate', () => {
    test('[P0] buildCommand includes database-schemas:generate', () => {
      const config = loadVercelConfig();
      const buildCommand = config.buildCommand;
      expect(typeof buildCommand).toBe('string');
      expect(buildCommand as string).toContain('database-schemas:generate');
    });

    test('[P0] buildCommand includes nx build web', () => {
      const config = loadVercelConfig();
      const buildCommand = config.buildCommand;
      expect(typeof buildCommand).toBe('string');
      expect(buildCommand as string).toContain('nx build web');
    });

    test('[P1] buildCommand runs prisma generate before nx build web', () => {
      const config = loadVercelConfig();
      const buildCommand = config.buildCommand as string;
      const generateIndex = buildCommand.indexOf('database-schemas:generate');
      const buildIndex = buildCommand.indexOf('nx build web');
      expect(generateIndex).toBeGreaterThan(-1);
      expect(buildIndex).toBeGreaterThan(-1);
      expect(generateIndex).toBeLessThan(buildIndex);
    });
  });

  describe('AC-2: auto-deploy disabled', () => {
    test('[P0] git.deploymentEnabled is false', () => {
      const config = loadVercelConfig();
      const git = config.git as Record<string, unknown> | undefined;
      expect(git).toBeDefined();
      expect(git?.deploymentEnabled).toBe(false);
    });
  });

  describe('AC-1: schema validation', () => {
    test('[P1] $schema is present for IDE validation', () => {
      const config = loadVercelConfig();
      expect(config.$schema).toBe('https://openapi.vercel.sh/vercel.json');
    });
  });
});
