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

describe('4.5 — DATABASE_URL env validation', () => {
  const validBase = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    DAYTONA_API_URL: 'https://api.daytona.io',
    DAYTONA_API_KEY: 'daytona-key',
    AUTH_SECRET: 'auth-secret',
    ANTHROPIC_API_KEY: 'sk-ant-key',
  };

  test('[P0] validateEnv accepts a valid DATABASE_URL', () => {
    const result = validateEnv(validBase);
    expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
  });

  test('[P0] validateEnv rejects a non-URL DATABASE_URL', () => {
    expect(() =>
      validateEnv({ ...validBase, DATABASE_URL: 'not-a-url' }),
    ).toThrow(/DATABASE_URL/);
  });

  test('[P0] validateEnv rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _, ...withoutKey } = validBase;
    expect(() => validateEnv(withoutKey)).toThrow(/DATABASE_URL/);
  });
});

describe('4.5 — AUTH_SECRET env validation', () => {
  const validBase = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    DAYTONA_API_URL: 'https://api.daytona.io',
    DAYTONA_API_KEY: 'daytona-key',
    AUTH_SECRET: 'auth-secret',
    ANTHROPIC_API_KEY: 'sk-ant-key',
  };

  test('[P0] validateEnv accepts a non-empty AUTH_SECRET', () => {
    const result = validateEnv(validBase);
    expect(result.AUTH_SECRET).toBe('auth-secret');
  });

  test('[P0] validateEnv rejects an empty AUTH_SECRET', () => {
    expect(() => validateEnv({ ...validBase, AUTH_SECRET: '' })).toThrow(
      /AUTH_SECRET/,
    );
  });

  test('[P0] validateEnv rejects a missing AUTH_SECRET', () => {
    const { AUTH_SECRET: _, ...withoutKey } = validBase;
    expect(() => validateEnv(withoutKey)).toThrow(/AUTH_SECRET/);
  });
});

describe('4.5 — DAYTONA_* env validation (required at boot)', () => {
  const validBase = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    DAYTONA_API_URL: 'https://api.daytona.io',
    DAYTONA_API_KEY: 'daytona-key',
    AUTH_SECRET: 'auth-secret',
    ANTHROPIC_API_KEY: 'sk-ant-key',
  };

  test('[P0] validateEnv accepts valid DAYTONA_API_URL and DAYTONA_API_KEY', () => {
    const result = validateEnv(validBase);
    expect(result.DAYTONA_API_URL).toBe('https://api.daytona.io');
    expect(result.DAYTONA_API_KEY).toBe('daytona-key');
  });

  test('[P0] validateEnv rejects an empty DAYTONA_API_URL', () => {
    expect(() =>
      validateEnv({ ...validBase, DAYTONA_API_URL: '' }),
    ).toThrow(/DAYTONA_API_URL/);
  });

  test('[P0] validateEnv rejects a missing DAYTONA_API_URL', () => {
    const { DAYTONA_API_URL: _, ...withoutKey } = validBase;
    expect(() => validateEnv(withoutKey)).toThrow(/DAYTONA_API_URL/);
  });

  test('[P0] validateEnv rejects an empty DAYTONA_API_KEY', () => {
    expect(() =>
      validateEnv({ ...validBase, DAYTONA_API_KEY: '' }),
    ).toThrow(/DAYTONA_API_KEY/);
  });

  test('[P0] validateEnv rejects a missing DAYTONA_API_KEY', () => {
    const { DAYTONA_API_KEY: _, ...withoutKey } = validBase;
    expect(() => validateEnv(withoutKey)).toThrow(/DAYTONA_API_KEY/);
  });
});
