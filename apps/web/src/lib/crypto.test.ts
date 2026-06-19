/**
 * @jest-environment node
 *
 * ATDD — Story 1.3: Connect a Repository by URL
 * Unit tests for the AES-256-GCM credential encryption utilities (crypto.ts).
 * Covers AC-3: encrypted storage, unique nonces per call.
 *
 * RED PHASE: all tests are skipped until crypto.ts is implemented (Task 2).
 * Remove test.skip() one test at a time as you implement.
 */

// Module will not resolve until crypto.ts is created in Task 2.1.
// That is expected — this is the TDD red-phase signal.
import { encryptToken, decryptToken } from './crypto';

const VALID_KEK = 'a'.repeat(64); // 64 hex chars = 32 bytes — valid for tests

describe('encryptToken / decryptToken (AC-3)', () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEK = VALID_KEK;
  });

  afterEach(() => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEK;
  });

  it('[P0] roundtrips an OAuth access token correctly', () => {
    const token = 'gho_test_access_token_12345';
    const encrypted = encryptToken(token);
    expect(decryptToken(encrypted)).toBe(token);
  });

  it('[P0] generates unique nonces on each call — no GCM nonce reuse (AC-3)', () => {
    const enc1 = encryptToken('token');
    const enc2 = encryptToken('token');
    // Both the DEK nonce and token nonce must differ across calls
    expect(enc1.dekNonce).not.toBe(enc2.dekNonce);
    expect(enc1.tokenNonce).not.toBe(enc2.tokenNonce);
    // The ciphertexts must also differ (different DEKs + different nonces)
    expect(enc1.encryptedToken).not.toBe(enc2.encryptedToken);
  });

  it('[P0] stored ciphertexts never share a nonce — verified across 20 calls (AC-3)', () => {
    // If nonces were ever reused, GCM authentication tag leaks the key.
    const dekNonces = new Set<string>();
    const tokenNonces = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const enc = encryptToken(`token-${i}`);
      dekNonces.add(enc.dekNonce);
      tokenNonces.add(enc.tokenNonce);
    }
    expect(dekNonces.size).toBe(20);
    expect(tokenNonces.size).toBe(20);
  });

  it('[P1] throws if CREDENTIAL_ENCRYPTION_KEK is missing', () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEK;
    expect(() => encryptToken('x')).toThrow('CREDENTIAL_ENCRYPTION_KEK');
  });

  it('[P1] throws if CREDENTIAL_ENCRYPTION_KEK is not a 64-char hex string', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEK = 'tooshort';
    expect(() => encryptToken('x')).toThrow('CREDENTIAL_ENCRYPTION_KEK');
  });

  it('[P1] encrypted result contains all four required base64 fields', () => {
    const result = encryptToken('gho_mytoken');
    expect(result).toHaveProperty('encryptedDek');
    expect(result).toHaveProperty('dekNonce');
    expect(result).toHaveProperty('encryptedToken');
    expect(result).toHaveProperty('tokenNonce');
    // All four values must be non-empty base64 strings
    for (const key of ['encryptedDek', 'dekNonce', 'encryptedToken', 'tokenNonce'] as const) {
      expect(typeof result[key]).toBe('string');
      expect(result[key].length).toBeGreaterThan(0);
    }
  });

  it('[P1] decryptToken is the inverse of encryptToken for empty string', () => {
    const encrypted = encryptToken('');
    expect(decryptToken(encrypted)).toBe('');
  });

  it('[P1] decryptToken is the inverse for a token with special characters', () => {
    const token = 'gho_abc123!@#$%^&*()_+\nwith-newline\ttab';
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it('[P0] decryptToken rejects a tampered ciphertext — GCM authentication tag integrity (AC-3)', () => {
    const encrypted = encryptToken('sensitive-token');
    // Corrupt the last byte of encryptedToken (GCM appends the 16-byte auth tag at the end)
    const buf = Buffer.from(encrypted.encryptedToken, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = { ...encrypted, encryptedToken: buf.toString('base64') };
    expect(() => decryptToken(tampered)).toThrow();
  });
});
