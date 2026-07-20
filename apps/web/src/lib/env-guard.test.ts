/**
 * @jest-environment node
 *
 * Unit tests for assertRequiredEnv() in env-guard.ts.
 *
 * assertRequiredEnv() first validates the full env schema via Zod
 * (API_URL must be a URL, AUTH_SECRET min 1 char, DATABASE_URL any string,
 * CREDENTIAL_ENCRYPTION_KEK min 1 char) and then enforces the TEST_ENV /
 * production guard: TEST_ENV must not be set when NODE_ENV=production unless
 * ALLOW_TEST_ENDPOINTS_IN_PRODUCTION='true'.
 *
 * Tests set a baseline of valid required env vars in beforeEach before
 * exercising the TEST_ENV branch, otherwise Zod throws before reaching it.
 */

import { assertRequiredEnv } from './env-guard';

const VALID_REQUIRED_ENV = {
  API_URL: 'http://localhost:3000',
  AUTH_SECRET: 'test-secret',
  DATABASE_URL: 'postgresql://localhost:5432/test',
  CREDENTIAL_ENCRYPTION_KEK: 'test-kek',
} as const;

const MANAGED_KEYS = [
  'API_URL',
  'AUTH_SECRET',
  'DATABASE_URL',
  'CREDENTIAL_ENCRYPTION_KEK',
  'TEST_ENV',
  'ALLOW_TEST_ENDPOINTS_IN_PRODUCTION',
  'NODE_ENV',
] as const;

describe('assertRequiredEnv()', () => {
  const prev: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of MANAGED_KEYS) prev[key] = process.env[key];
  });

  beforeEach(() => {
    for (const key of MANAGED_KEYS) delete process.env[key];
    Object.assign(process.env, VALID_REQUIRED_ENV);
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      configurable: true,
    });
  });

  afterEach(() => {
    for (const key of MANAGED_KEYS) delete process.env[key];
  });

  afterAll(() => {
    for (const key of MANAGED_KEYS) {
      if (prev[key] === undefined) {
        delete process.env[key];
      } else if (key === 'NODE_ENV') {
        Object.defineProperty(process.env, 'NODE_ENV', {
          value: prev[key],
          configurable: true,
        });
      } else {
        process.env[key] = prev[key]!;
      }
    }
  });

  it('does not throw when all required env vars are set and TEST_ENV is unset', () => {
    delete process.env.TEST_ENV;
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it('throws an env validation error when a required var (AUTH_SECRET) is missing', () => {
    delete process.env.AUTH_SECRET;
    expect(() => assertRequiredEnv()).toThrow(/Environment validation failed/);
    expect(() => assertRequiredEnv()).toThrow(/AUTH_SECRET/);
  });

  it('throws when TEST_ENV set + NODE_ENV=production + bypass unset', () => {
    process.env.TEST_ENV = 'ci';
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
    delete process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION;
    expect(() => assertRequiredEnv()).toThrow(
      'TEST_ENV must not be set in a production environment (NODE_ENV=production) — refusing to start',
    );
  });

  it('does not throw when TEST_ENV set + NODE_ENV=production + bypass is true', () => {
    process.env.TEST_ENV = 'ci';
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
    process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION = 'true';
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it('throws when TEST_ENV set + NODE_ENV=production + bypass is false', () => {
    process.env.TEST_ENV = 'ci';
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
    process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION = 'false';
    expect(() => assertRequiredEnv()).toThrow(
      'TEST_ENV must not be set in a production environment',
    );
  });

  it('does not throw when TEST_ENV set + NODE_ENV is not production', () => {
    process.env.TEST_ENV = 'ci';
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true,
    });
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it('does not throw when TEST_ENV unset + NODE_ENV=production', () => {
    delete process.env.TEST_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
    expect(() => assertRequiredEnv()).not.toThrow();
  });
});
