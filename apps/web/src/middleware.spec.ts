/**
 * @jest-environment node
 *
 * Integration tests for the middleware matcher composition.
 * Verifies the matcher regex excludes the right paths (so the `authorized`
 * callback is never invoked for them) and matches everything else.
 *
 * The `authorized` callback behavior is tested in `auth.config.spec.ts`.
 * This file tests the matcher that determines which paths reach the callback.
 */

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({ auth: jest.fn() })),
}));

jest.mock('next-auth/providers/github', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'github', name: 'GitHub', type: 'oauth' })),
}));

import { config } from './middleware';

const matcherPattern = config.matcher![0];
const matcherRegex = new RegExp(`^${matcherPattern}$`);

function isMatched(path: string): boolean {
  return matcherRegex.test(path);
}

describe('middleware matcher composition', () => {
  describe('excluded paths (authorized callback never invoked)', () => {
    it.each([
      ['/sign-in'],
      ['/sign-in/'],
      ['/api/auth/callback/github'],
      ['/api/auth/signin'],
      ['/api/internal/test/seed-user'],
      ['/_next/static/chunk.js'],
      ['/_next/image?url=foo'],
      ['/favicon.ico'],
    ])('does NOT match %s', (path) => {
      expect(isMatched(path)).toBe(false);
    });
  });

  describe('matched paths (authorized callback invoked)', () => {
    it.each([
      ['/'],
      ['/onboarding'],
      ['/conversations/123'],
      ['/api/conversations'],
      ['/project-map'],
      ['/settings'],
    ])('matches %s', (path) => {
      expect(isMatched(path)).toBe(true);
    });
  });
});
