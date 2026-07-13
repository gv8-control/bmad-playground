/**
 * Story 4.5 AC-6: NODE_ENV=production in Dockerfile runtime stage
 *
 * Verifies that the Dockerfile runtime stage sets `ENV NODE_ENV=production`.
 * This is a Docker ENV instruction baked into the image — every container
 * start has NODE_ENV=production. The existing `assertTestEnvNotInProduction()`
 * guard in apps/web checks `NODE_ENV === 'production'` to enforce TEST_ENV
 * is never set in production; without NODE_ENV=production, the guard cannot
 * distinguish production from development.
 *
 * This test is separate from `dockerfile.spec.ts` (Story 4.3) because AC-6
 * was introduced in Story 4.5, not 4.3.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function loadRuntimeStage(): string {
  const dockerfilePath = join(__dirname, '..', 'Dockerfile');
  if (!existsSync(dockerfilePath)) {
    return '';
  }
  const content = readFileSync(dockerfilePath, 'utf8');
  const match = content.match(/FROM\s+node:24-slim\s+AS\s+runtime([\s\S]*)/i);
  return match ? match[1] : '';
}

describe('4.5-AC6 — NODE_ENV=production in Dockerfile runtime stage', () => {
  test('[P0] Dockerfile runtime stage sets ENV NODE_ENV=production', () => {
    const runtimeStage = loadRuntimeStage();
    expect(runtimeStage.length).toBeGreaterThan(0);
    expect(runtimeStage).toMatch(/ENV\s+NODE_ENV=production/i);
  });

  test('[P0] ENV NODE_ENV=production appears before CMD in runtime stage', () => {
    const runtimeStage = loadRuntimeStage();
    expect(runtimeStage.length).toBeGreaterThan(0);
    const envIndex = runtimeStage.search(/ENV\s+NODE_ENV=production/i);
    const cmdIndex = runtimeStage.search(/CMD\s*\[/i);
    expect(envIndex).toBeGreaterThan(-1);
    expect(cmdIndex).toBeGreaterThan(-1);
    expect(envIndex).toBeLessThan(cmdIndex);
  });
});
