/**
 * @jest-environment node
 *
 * Unit tests for resolveGitIdentity — Story 1.5 AC-1, AC-2, AC-3.
 */
import { resolveGitIdentity } from './git-identity';

describe('resolveGitIdentity (AC-1, AC-2, AC-3)', () => {
  describe('AC-1: name and email from OAuth profile', () => {
    it('returns name and email exactly as provided', () => {
      const result = resolveGitIdentity({
        name: 'Jane Developer',
        email: 'jane@example.com',
        githubLogin: 'janedev',
      });
      expect(result).toEqual({
        name: 'Jane Developer',
        email: 'jane@example.com',
      });
    });

    it('returns name and email with special characters preserved', () => {
      const result = resolveGitIdentity({
        name: 'José García-López',
        email: 'jose.garcia@sub.domain.example.com',
        githubLogin: 'josegl',
      });
      expect(result.name).toBe('José García-López');
      expect(result.email).toBe('jose.garcia@sub.domain.example.com');
    });
  });

  describe('AC-2: noreply email fallback', () => {
    it('falls back to noreply email when email is null', () => {
      const result = resolveGitIdentity({
        name: 'Jane Developer',
        email: null,
        githubLogin: 'janedev',
      });
      expect(result.email).toBe('janedev@users.noreply.github.com');
    });

    it('falls back to noreply email when email is empty string', () => {
      const result = resolveGitIdentity({
        name: 'Jane Developer',
        email: '',
        githubLogin: 'janedev',
      });
      expect(result.email).toBe('janedev@users.noreply.github.com');
    });

    it('falls back to noreply email when email is whitespace-only', () => {
      const result = resolveGitIdentity({
        name: 'Jane Developer',
        email: '   ',
        githubLogin: 'janedev',
      });
      expect(result.email).toBe('janedev@users.noreply.github.com');
    });

    it('preserves name when only email is missing', () => {
      const result = resolveGitIdentity({
        name: 'Jane Developer',
        email: null,
        githubLogin: 'janedev',
      });
      expect(result.name).toBe('Jane Developer');
    });
  });

  describe('name fallback to githubLogin', () => {
    it('falls back to githubLogin when name is null', () => {
      const result = resolveGitIdentity({
        name: null,
        email: 'jane@example.com',
        githubLogin: 'janedev',
      });
      expect(result.name).toBe('janedev');
    });

    it('falls back to githubLogin when name is empty string', () => {
      const result = resolveGitIdentity({
        name: '',
        email: 'jane@example.com',
        githubLogin: 'janedev',
      });
      expect(result.name).toBe('janedev');
    });

    it('falls back to githubLogin when name is whitespace-only', () => {
      const result = resolveGitIdentity({
        name: '  ',
        email: 'jane@example.com',
        githubLogin: 'janedev',
      });
      expect(result.name).toBe('janedev');
    });
  });

  describe('both name and email absent', () => {
    it('falls back to githubLogin for name and noreply email', () => {
      const result = resolveGitIdentity({
        name: null,
        email: null,
        githubLogin: 'janedev',
      });
      expect(result).toEqual({
        name: 'janedev',
        email: 'janedev@users.noreply.github.com',
      });
    });
  });

  describe('AC-3: no token leakage', () => {
    it('return type contains only name and email keys', () => {
      // Note: this is a runtime check only. An optional `token?: string`
      // added to GitIdentityUser would still type-check and pass this test
      // unnoticed — it does not guard the function's input signature.
      const result = resolveGitIdentity({
        name: 'Jane',
        email: 'jane@example.com',
        githubLogin: 'janedev',
      });
      expect(Object.keys(result).sort()).toEqual(['email', 'name']);
    });
  });
});
