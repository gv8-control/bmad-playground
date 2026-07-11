/**
 * CORS options for agent-be — unit tests for resolveCorsOptions().
 *
 * Covers: env var parsing, fallback behavior, trailing-slash normalization,
 * wildcard filtering, and whitespace handling.
 */

import { resolveCorsOptions } from './cors-options';

describe('resolveCorsOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('[P0] falls back to localhost:3000 when CORS_ALLOWED_ORIGINS is unset', () => {
    expect(resolveCorsOptions()).toEqual({
      origin: ['http://localhost:3000'],
      credentials: true,
    });
  });

  it('[P0] falls back to localhost:3000 when CORS_ALLOWED_ORIGINS is an empty string', () => {
    process.env.CORS_ALLOWED_ORIGINS = '';
    expect(resolveCorsOptions()).toEqual({
      origin: ['http://localhost:3000'],
      credentials: true,
    });
  });

  it('[P1] returns a single origin when CORS_ALLOWED_ORIGINS has one value', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';
    expect(resolveCorsOptions()).toEqual({
      origin: ['https://app.example.com'],
      credentials: true,
    });
  });

  it('[P1] returns multiple origins when CORS_ALLOWED_ORIGINS is comma-separated', () => {
    process.env.CORS_ALLOWED_ORIGINS =
      'http://localhost:3000,https://app.example.com';
    expect(resolveCorsOptions()).toEqual({
      origin: ['http://localhost:3000', 'https://app.example.com'],
      credentials: true,
    });
  });

  it('[P1] trims whitespace around comma-separated origins', () => {
    process.env.CORS_ALLOWED_ORIGINS =
      ' http://localhost:3000 , https://app.example.com ';
    expect(resolveCorsOptions()).toEqual({
      origin: ['http://localhost:3000', 'https://app.example.com'],
      credentials: true,
    });
  });

  it('[P1] strips trailing slashes from origins', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com/';
    expect(resolveCorsOptions()).toEqual({
      origin: ['https://app.example.com'],
      credentials: true,
    });
  });

  it('[P1] strips multiple trailing slashes from origins', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com//';
    expect(resolveCorsOptions()).toEqual({
      origin: ['https://app.example.com'],
      credentials: true,
    });
  });

  it('[P1] filters out wildcard * as sole origin and falls back to default', () => {
    process.env.CORS_ALLOWED_ORIGINS = '*';
    expect(resolveCorsOptions()).toEqual({
      origin: ['http://localhost:3000'],
      credentials: true,
    });
  });

  it('[P1] filters out wildcard * mixed with explicit origins', () => {
    process.env.CORS_ALLOWED_ORIGINS =
      'http://localhost:3000,*,https://app.example.com';
    expect(resolveCorsOptions()).toEqual({
      origin: ['http://localhost:3000', 'https://app.example.com'],
      credentials: true,
    });
  });

  it('[P1] falls back to default when value is whitespace-only', () => {
    process.env.CORS_ALLOWED_ORIGINS = '   ';
    expect(resolveCorsOptions()).toEqual({
      origin: ['http://localhost:3000'],
      credentials: true,
    });
  });

  it('[P1] falls back to default when value is commas-only', () => {
    process.env.CORS_ALLOWED_ORIGINS = ',,,';
    expect(resolveCorsOptions()).toEqual({
      origin: ['http://localhost:3000'],
      credentials: true,
    });
  });
});
