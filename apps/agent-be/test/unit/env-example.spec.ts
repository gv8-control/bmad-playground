/**
 * @jest-environment node
 *
 * Story 6.1 AC-5: ANTHROPIC_API_KEY fails loudly at startup
 *
 * Verifies that apps/agent-be/.env.example exists and documents
 * ANTHROPIC_API_KEY as a required variable. The env validation itself
 * (Zod schema rejecting missing/empty ANTHROPIC_API_KEY at boot) is already
 * tested in env.validation.spec.ts (Story 4.5 AC-7). This test guards the
 * documentation artifact — .env.example must exist and list the variable so
 * operators know to set it.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('[P0] Story 6.1 AC-5 — .env.example documents ANTHROPIC_API_KEY', () => {
  const envExamplePath = join(__dirname, '..', '..', '.env.example');

  it('[P0] apps/agent-be/.env.example file exists', () => {
    expect(existsSync(envExamplePath)).toBe(true);
  });

  it('[P0] .env.example documents ANTHROPIC_API_KEY as a required variable', () => {
    // Guard: if the file doesn't exist, skip the content check (covered by the test above)
    if (!existsSync(envExamplePath)) {
      return;
    }
    const content = readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('ANTHROPIC_API_KEY');
  });
});
