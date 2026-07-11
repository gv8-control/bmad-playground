/**
 * @jest-environment node
 *
 * Story 3.1: Provision a Sandbox When Opening a Conversation
 * Unit tests for the agent-be EncryptionService (decryption path).
 * Verifies interoperability with the apps/web encryptToken() function
 * (same AES-256-GCM envelope encryption logic, deliberately duplicated).
 *
 * Covers AC-1: OAuth token decryption in agent-be.
 */
import { createCipheriv, randomBytes } from 'crypto';
import { EncryptionService, KekConfigurationError } from './encryption.service';

const VALID_KEK = 'a'.repeat(64);
const USER_A = 'user-aaa';
const USER_B = 'user-bbb';

function encryptToken(plaintext: string, userId: string) {
  const kek = Buffer.from(VALID_KEK, 'hex');
  const dek = randomBytes(32);
  try {
    const dekNonce = randomBytes(12);
    const dekCipher = createCipheriv('aes-256-gcm', kek, dekNonce);
    dekCipher.setAAD(Buffer.from(userId, 'utf8'));
    const encryptedDekBody = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
    const dekTag = dekCipher.getAuthTag();

    const tokenNonce = randomBytes(12);
    const tokenCipher = createCipheriv('aes-256-gcm', dek, tokenNonce);
    tokenCipher.setAAD(Buffer.from(userId, 'utf8'));
    const encryptedTokenBody = Buffer.concat([
      tokenCipher.update(Buffer.from(plaintext, 'utf8')),
      tokenCipher.final(),
    ]);
    const tokenTag = tokenCipher.getAuthTag();

    return {
      encryptedDek: Buffer.concat([encryptedDekBody, dekTag]).toString('base64'),
      dekNonce: dekNonce.toString('base64'),
      encryptedToken: Buffer.concat([encryptedTokenBody, tokenTag]).toString('base64'),
      tokenNonce: tokenNonce.toString('base64'),
      kekId: '',
    };
  } finally {
    dek.fill(0);
  }
}

describe('EncryptionService (agent-be)', () => {
  const originalEnv = process.env;
  let service: EncryptionService;

  beforeEach(() => {
    process.env = { ...originalEnv, CREDENTIAL_ENCRYPTION_KEK: VALID_KEK };
    service = new EncryptionService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('[P0] decrypts a token encrypted by the apps/web encryptToken() function', () => {
    const token = 'gho_test_access_token_12345';
    const encrypted = encryptToken(token, USER_A);
    expect(service.decryptToken(encrypted, USER_A)).toBe(token);
  });

  it('[P0] throws on tampered ciphertext — GCM authentication tag integrity', () => {
    const encrypted = encryptToken('sensitive-token', USER_A);
    const buf = Buffer.from(encrypted.encryptedToken, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = { ...encrypted, encryptedToken: buf.toString('base64') };
    expect(() => service.decryptToken(tampered, USER_A)).toThrow();
  });

  it('[P0] throws on wrong userId (AAD binding — ciphertext-transplant defense)', () => {
    const encryptedForA = encryptToken('sensitive-token-for-a', USER_A);
    expect(() => service.decryptToken(encryptedForA, USER_B)).toThrow();
  });

  it('[P1] throws KekConfigurationError on missing KEK', () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEK;
    const encrypted = encryptToken('token', USER_A);
    expect(() => service.decryptToken(encrypted, USER_A)).toThrow(KekConfigurationError);
  });
});
