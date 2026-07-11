/**
 * Story 1.1-AC1: Nx workspace builds (Yarn/Corepack, apps/libs)
 *
 * The ATDD checklist (`atdd-checklist-1-1`) documents an intentional exclusion:
 * Story 1.1 is a pure infrastructure story whose ACs describe build-system and
 * tooling outcomes, not observable user behaviours. Testing the build system
 * itself is circular — `nx build` failures are caught by CI, not by acceptance
 * tests.
 *
 * This smoke test replaces "NONE" coverage with a minimal structural sanity
 * check: it verifies the Nx workspace skeleton exists (package.json, nx.json,
 * at least one project.json). It does NOT test the build system.
 */
import { existsSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..', '..', '..', '..');

describe('1.1-AC1 — Nx workspace structure (intentional exclusion smoke check)', () => {
  it('package.json exists at repo root', () => {
    expect(existsSync(join(repoRoot, 'package.json'))).toBe(true);
  });

  it('nx.json exists at repo root', () => {
    expect(existsSync(join(repoRoot, 'nx.json'))).toBe(true);
  });

  it('at least one project.json exists (apps or libs)', () => {
    const projectJsons = [
      join(repoRoot, 'apps', 'web', 'project.json'),
      join(repoRoot, 'apps', 'agent-be', 'project.json'),
      join(repoRoot, 'libs', 'shared-types', 'project.json'),
      join(repoRoot, 'libs', 'database-schemas', 'project.json'),
    ];
    const found = projectJsons.filter(existsSync);
    expect(found.length).toBeGreaterThan(0);
  });
});
