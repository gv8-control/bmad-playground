/**
 * @jest-environment node
 *
 * ATDD — Story 1.3: Connect a Repository by URL
 * Unit tests for the AES-256-GCM credential encryption utilities (crypto.ts).
 * Covers AC-3: encrypted storage, unique nonces per call.
 *
 * ATDD — Story 1.9: Document and Validate the KEK Rotation Runbook
 * Unit tests for the DEK unwrap/re-wrap helpers used by scripts/rotate-kek.ts.
 * Covers AC-2: every previously-encrypted token remains decryptable after rotation.
 *
 * Post-1.9 backlog hardening: AAD binding to userId (ciphertext-transplant
 * defense), kekId fingerprinting, DEK buffer zeroing, nonce-length validation,
 * and the corrected encryptedDek minimum-size guard.
 */

import {
  encryptToken,
  decryptToken,
  unwrapDek,
  rewrapDek,
  parseKekHex,
  computeKekId,
} from './crypto';

const VALID_KEK = 'a'.repeat(64); // 64 hex chars = 32 bytes — valid for tests
const USER_A = 'user-aaa';
const USER_B = 'user-bbb';

describe('encryptToken / decryptToken (AC-3)', () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEK = VALID_KEK;
  });

  afterEach(() => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEK;
  });

  it('[P0] roundtrips an OAuth access token correctly', () => {
    const token = 'gho_test_access_token_12345';
    const encrypted = encryptToken(token, USER_A);
    expect(decryptToken(encrypted, USER_A)).toBe(token);
  });

  it('[P0] generates unique nonces on each call — no GCM nonce reuse (AC-3)', () => {
    const enc1 = encryptToken('token', USER_A);
    const enc2 = encryptToken('token', USER_A);
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
      const enc = encryptToken(`token-${i}`, USER_A);
      dekNonces.add(enc.dekNonce);
      tokenNonces.add(enc.tokenNonce);
    }
    expect(dekNonces.size).toBe(20);
    expect(tokenNonces.size).toBe(20);
  });

  it('[P1] throws if CREDENTIAL_ENCRYPTION_KEK is missing', () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEK;
    expect(() => encryptToken('x', USER_A)).toThrow('CREDENTIAL_ENCRYPTION_KEK');
  });

  it('[P1] throws if CREDENTIAL_ENCRYPTION_KEK is not a 64-char hex string', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEK = 'tooshort';
    expect(() => encryptToken('x', USER_A)).toThrow('CREDENTIAL_ENCRYPTION_KEK');
  });

  it('[P1] encrypted result contains all required base64/string fields', () => {
    const result = encryptToken('gho_mytoken', USER_A);
    expect(result).toHaveProperty('encryptedDek');
    expect(result).toHaveProperty('dekNonce');
    expect(result).toHaveProperty('encryptedToken');
    expect(result).toHaveProperty('tokenNonce');
    expect(result).toHaveProperty('kekId');
    // All four base64 values must be non-empty strings
    for (const key of ['encryptedDek', 'dekNonce', 'encryptedToken', 'tokenNonce'] as const) {
      expect(typeof result[key]).toBe('string');
      expect(result[key].length).toBeGreaterThan(0);
    }
    // kekId is a 16-hex-char fingerprint
    expect(result.kekId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('[P1] decryptToken is the inverse of encryptToken for empty string', () => {
    const encrypted = encryptToken('', USER_A);
    expect(decryptToken(encrypted, USER_A)).toBe('');
  });

  it('[P1] decryptToken is the inverse for a token with special characters', () => {
    const token = 'gho_abc123!@#$%^&*()_+\nwith-newline\ttab';
    expect(decryptToken(encryptToken(token, USER_A), USER_A)).toBe(token);
  });

  it('[P0] decryptToken rejects a tampered ciphertext — GCM authentication tag integrity (AC-3)', () => {
    const encrypted = encryptToken('sensitive-token', USER_A);
    // Corrupt the last byte of encryptedToken (GCM appends the 16-byte auth tag at the end)
    const buf = Buffer.from(encrypted.encryptedToken, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = { ...encrypted, encryptedToken: buf.toString('base64') };
    expect(() => decryptToken(tampered, USER_A)).toThrow();
  });
});

// ─── Backlog hardening: AAD binding to userId (ciphertext-transplant defense) ──

describe('AAD binding — userId-scoped envelope encryption (backlog hardening)', () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEK = VALID_KEK;
  });

  afterEach(() => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEK;
  });

  it('[P0] decrypting under a different userId than encrypted fails closed with an auth-tag error — ciphertext-transplant defense', () => {
    // Simulates copying one user's {encryptedDek, dekNonce, encryptedToken,
    // tokenNonce} tuple into another user's row (or a pre-AAD-format
    // ciphertext, which is equivalent to AAD="" vs AAD=userId mismatch).
    const encryptedForA = encryptToken('sensitive-token-for-a', USER_A);

    expect(() => decryptToken(encryptedForA, USER_B)).toThrow();
  });

  it('[P0] the DEK-wrap layer alone rejects a userId mismatch via unwrapDek', () => {
    const encryptedForA = encryptToken('token', USER_A);
    expect(() =>
      unwrapDek(encryptedForA, Buffer.from(VALID_KEK, 'hex'), USER_B),
    ).toThrow();
    // Correct userId still works
    expect(
      unwrapDek(encryptedForA, Buffer.from(VALID_KEK, 'hex'), USER_A).length,
    ).toBe(32);
  });
});

describe('computeKekId — KEK fingerprinting (backlog hardening)', () => {
  it('[P1] returns a deterministic 16-hex-char fingerprint for a given KEK', () => {
    const kek = Buffer.from(VALID_KEK, 'hex');
    const id1 = computeKekId(kek);
    const id2 = computeKekId(kek);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('[P1] different KEKs produce different fingerprints', () => {
    const kekA = Buffer.from('a'.repeat(64), 'hex');
    const kekB = Buffer.from('b'.repeat(64), 'hex');
    expect(computeKekId(kekA)).not.toBe(computeKekId(kekB));
  });
});

// ─── Story 1.9: KEK rotation helpers (AC-2) ───────────────────────────────────

const KEK_A_HEX = 'a'.repeat(64);
const KEK_B_HEX = 'b'.repeat(64);
const KEK_C_HEX = 'c'.repeat(64);

describe('unwrapDek / rewrapDek — KEK rotation (Story 1.9, AC-2)', () => {
  afterEach(() => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEK;
  });

  function encryptUnderKekA(plaintext: string) {
    process.env.CREDENTIAL_ENCRYPTION_KEK = KEK_A_HEX;
    return encryptToken(plaintext, USER_A);
  }

  test('[P0] rewrapped credential decrypts under the new KEK — rotation round-trip (AC-2)', () => {
    const token = 'synthetic-token-roundtrip';
    const credential = encryptUnderKekA(token);

    const rewrapped = rewrapDek(
      credential,
      Buffer.from(KEK_A_HEX, 'hex'),
      Buffer.from(KEK_B_HEX, 'hex'),
      USER_A,
    );

    process.env.CREDENTIAL_ENCRYPTION_KEK = KEK_B_HEX;
    expect(
      decryptToken({ ...credential, ...rewrapped }, USER_A),
    ).toBe(token);
  });

  test('[P0] rewrapDek preserves the DEK bytes exactly', () => {
    const credential = encryptUnderKekA('synthetic-token-dek');
    const kekA = Buffer.from(KEK_A_HEX, 'hex');
    const kekB = Buffer.from(KEK_B_HEX, 'hex');

    const originalDek = unwrapDek(credential, kekA, USER_A);
    const rewrapped = rewrapDek(credential, kekA, kekB, USER_A);
    const rotatedDek = unwrapDek(rewrapped, kekB, USER_A);

    expect(rotatedDek.equals(originalDek)).toBe(true);
  });

  test('[P0] rewrapDek uses a FRESH dekNonce, updates kekId, and returns only DEK fields — token fields untouched', () => {
    const credential = encryptUnderKekA('synthetic-token-nonce');

    const rewrapped = rewrapDek(
      credential,
      Buffer.from(KEK_A_HEX, 'hex'),
      Buffer.from(KEK_B_HEX, 'hex'),
      USER_A,
    );

    // GCM nonce-uniqueness invariant: never re-wrap under the old nonce.
    expect(rewrapped.dekNonce).not.toBe(credential.dekNonce);
    expect(rewrapped.encryptedDek).not.toBe(credential.encryptedDek);
    expect(rewrapped.kekId).not.toBe(credential.kekId);
    // Structurally impossible to touch token fields: only DEK + kekId fields are returned.
    expect(Object.keys(rewrapped).sort()).toEqual(['dekNonce', 'encryptedDek', 'kekId']);
  });

  test('[P0] rewrapDek with the wrong old KEK throws — GCM auth tag rejects (no silent corruption)', () => {
    const credential = encryptUnderKekA('synthetic-token-wrongkek');

    expect(() =>
      rewrapDek(
        credential,
        Buffer.from(KEK_C_HEX, 'hex'), // not the KEK that wrapped this DEK
        Buffer.from(KEK_B_HEX, 'hex'),
        USER_A,
      ),
    ).toThrow();
  });

  test('[P1] unwrapDek rejects a malformed encryptedDek (too short to contain a full 32-byte DEK + auth tag)', () => {
    expect(() =>
      unwrapDek(
        { encryptedDek: Buffer.from('xx').toString('base64'), dekNonce: Buffer.alloc(12).toString('base64') },
        Buffer.from(KEK_A_HEX, 'hex'),
        USER_A,
      ),
    ).toThrow();
  });

  test('[P1] unwrapDek rejects an encryptedDek that is exactly TAG_LENGTH (16 bytes) — the old off-by-guard bug', () => {
    // A 16-byte encryptedDek would previously pass the `< TAG_LENGTH` guard and
    // yield a zero-byte "DEK". A valid wrapped 32-byte DEK ciphertext is always
    // at least 48 bytes (32 + 16-byte tag), so this must now be rejected.
    expect(() =>
      unwrapDek(
        { encryptedDek: Buffer.alloc(16).toString('base64'), dekNonce: Buffer.alloc(12).toString('base64') },
        Buffer.from(KEK_A_HEX, 'hex'),
        USER_A,
      ),
    ).toThrow(/Malformed encryptedDek/);
  });

  test('[P1] unwrapDek rejects a tampered dekNonce — GCM auth failure, no silent wrong DEK', () => {
    const credential = encryptUnderKekA('synthetic-token-badnonce');
    const nonce = Buffer.from(credential.dekNonce, 'base64');
    nonce[0] ^= 0xff;

    expect(() =>
      unwrapDek(
        { encryptedDek: credential.encryptedDek, dekNonce: nonce.toString('base64') },
        Buffer.from(KEK_A_HEX, 'hex'),
        USER_A,
      ),
    ).toThrow();
  });

  test('[P1] unwrapDek rejects a dekNonce that does not decode to exactly 12 bytes', () => {
    const credential = encryptUnderKekA('synthetic-token-shortnonce');

    expect(() =>
      unwrapDek(
        { encryptedDek: credential.encryptedDek, dekNonce: Buffer.alloc(8).toString('base64') },
        Buffer.from(KEK_A_HEX, 'hex'),
        USER_A,
      ),
    ).toThrow(/Malformed dekNonce/);
  });

  test('[P1] decryptToken rejects a tokenNonce that does not decode to exactly 12 bytes', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEK = KEK_A_HEX;
    const credential = encryptToken('synthetic-token-shorttokennonce', USER_A);

    expect(() =>
      decryptToken(
        { ...credential, tokenNonce: Buffer.alloc(4).toString('base64') },
        USER_A,
      ),
    ).toThrow(/Malformed tokenNonce/);
  });

  test('[P1] after rotation the DEK no longer unwraps under the old KEK — powers already-rotated detection', () => {
    // This is the exact primitive scripts/rotate-kek.ts relies on to classify
    // a row as "already rotated" (fails under old KEK, succeeds under new).
    const credential = encryptUnderKekA('synthetic-token-classify');
    const kekA = Buffer.from(KEK_A_HEX, 'hex');
    const kekB = Buffer.from(KEK_B_HEX, 'hex');
    const rotated = { ...credential, ...rewrapDek(credential, kekA, kekB, USER_A) };

    expect(() => unwrapDek(rotated, kekA, USER_A)).toThrow();
    expect(unwrapDek(rotated, kekB, USER_A).length).toBe(32);
  });

  test('[P1] double rotation A→B→C keeps the token decryptable — idempotent re-run safety', () => {
    const token = 'synthetic-token-chain';
    const credential = encryptUnderKekA(token);
    const kekA = Buffer.from(KEK_A_HEX, 'hex');
    const kekB = Buffer.from(KEK_B_HEX, 'hex');
    const kekC = Buffer.from(KEK_C_HEX, 'hex');

    const afterB = { ...credential, ...rewrapDek(credential, kekA, kekB, USER_A) };
    const afterC = { ...afterB, ...rewrapDek(afterB, kekB, kekC, USER_A) };

    process.env.CREDENTIAL_ENCRYPTION_KEK = KEK_C_HEX;
    expect(decryptToken(afterC, USER_A)).toBe(token);
  });
});

describe('parseKekHex — KEK input validation (Story 1.9)', () => {
  test('[P1] parses a valid 64-char hex string into a 32-byte Buffer', () => {
    const kek = parseKekHex(KEK_A_HEX, 'CREDENTIAL_ENCRYPTION_KEK_OLD');
    expect(Buffer.isBuffer(kek)).toBe(true);
    expect(kek.length).toBe(32);
  });

  test('[P1] rejects a too-short value and names the offending variable in the error', () => {
    expect(() => parseKekHex('abc123', 'CREDENTIAL_ENCRYPTION_KEK_NEW')).toThrow(
      /CREDENTIAL_ENCRYPTION_KEK_NEW/,
    );
  });

  test('[P1] rejects non-hex characters', () => {
    expect(() => parseKekHex('z'.repeat(64), 'CREDENTIAL_ENCRYPTION_KEK_OLD')).toThrow();
  });

  test('[P1] rejects an empty/undefined value', () => {
    expect(() => parseKekHex('', 'CREDENTIAL_ENCRYPTION_KEK_OLD')).toThrow();
    expect(() =>
      parseKekHex(undefined as unknown as string, 'CREDENTIAL_ENCRYPTION_KEK_OLD'),
    ).toThrow();
  });
});
