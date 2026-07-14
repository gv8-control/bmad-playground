/**
 * @jest-environment node
 *
 * Story 4.5 AC-7: ANTHROPIC_API_KEY in env validation
 *
 * Verifies that the Zod env validation schema in env.validation.ts:
 * - Includes ANTHROPIC_API_KEY as a required field (min length 1)
 * - Rejects empty string (boot-time failure, not silent '' at call site)
 * - Rejects missing key entirely
 *
 * AC-7 ensures a missing key fails at boot rather than silently becoming ''
 * at the first agent run.
 */
import { envSchema, validateEnv } from './env.validation';

describe('4.5-AC7 — ANTHROPIC_API_KEY env validation', () => {
  const validBase = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    DAYTONA_API_URL: 'https://api.daytona.io',
    DAYTONA_API_KEY: 'daytona-key',
    AUTH_SECRET: 'auth-secret',
    ANTHROPIC_API_KEY: 'sk-ant-key',
  };

  test('[P0] envSchema includes ANTHROPIC_API_KEY as required field', () => {
    const keys = Object.keys(envSchema.shape);
    expect(keys).toContain('ANTHROPIC_API_KEY');
  });

  test('[P0] validateEnv accepts a valid ANTHROPIC_API_KEY', () => {
    const result = validateEnv(validBase);
    expect(result.ANTHROPIC_API_KEY).toBe('sk-ant-key');
  });

  test('[P0] validateEnv rejects empty ANTHROPIC_API_KEY', () => {
    expect(() =>
      validateEnv({ ...validBase, ANTHROPIC_API_KEY: '' }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  test('[P0] validateEnv rejects missing ANTHROPIC_API_KEY', () => {
    const { ANTHROPIC_API_KEY: _, ...withoutKey } = validBase;
    expect(() => validateEnv(withoutKey)).toThrow(/ANTHROPIC_API_KEY/);
  });
});
