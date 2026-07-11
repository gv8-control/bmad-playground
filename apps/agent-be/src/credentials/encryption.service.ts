import { Injectable } from '@nestjs/common';
import { createDecipheriv, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const DEK_LENGTH = 32;

export class KekConfigurationError extends Error {}

export function parseKekHex(value: string, label: string): Buffer {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new KekConfigurationError(
      `${label} must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32`,
    );
  }
  return Buffer.from(value, 'hex');
}

let cachedKek: Buffer | null = null;
let cachedKekEnv = '';

function getKek(): Buffer {
  const kekEnv = process.env.CREDENTIAL_ENCRYPTION_KEK ?? '';
  if (kekEnv === cachedKekEnv && cachedKek !== null) {
    return cachedKek;
  }
  cachedKek = parseKekHex(kekEnv, 'CREDENTIAL_ENCRYPTION_KEK');
  cachedKekEnv = kekEnv;
  return cachedKek;
}

export function computeKekId(kek: Buffer): string {
  return createHash('sha256').update(kek).digest('hex').slice(0, 16);
}

function toAad(userId: string): Buffer {
  return Buffer.from(userId, 'utf8');
}

function assertNonceLength(nonce: Buffer, label: string): void {
  if (nonce.length !== NONCE_LENGTH) {
    throw new Error(`Malformed ${label}: expected ${NONCE_LENGTH} bytes, got ${nonce.length}`);
  }
}

export interface EncryptedCredential {
  encryptedDek: string;
  dekNonce: string;
  encryptedToken: string;
  tokenNonce: string;
  kekId: string;
}

function unwrapDek(
  credential: Pick<EncryptedCredential, 'encryptedDek' | 'dekNonce'>,
  kek: Buffer,
  userId: string,
): Buffer {
  const dekNonce = Buffer.from(credential.dekNonce, 'base64');
  assertNonceLength(dekNonce, 'dekNonce');
  const encryptedDekBuf = Buffer.from(credential.encryptedDek, 'base64');
  if (encryptedDekBuf.length < DEK_LENGTH + TAG_LENGTH) {
    throw new Error('Malformed encryptedDek: too short');
  }
  const dekCiphertext = encryptedDekBuf.subarray(0, encryptedDekBuf.length - TAG_LENGTH);
  const dekTag = encryptedDekBuf.subarray(encryptedDekBuf.length - TAG_LENGTH);
  const dekDecipher = createDecipheriv(ALGORITHM, kek, dekNonce);
  dekDecipher.setAAD(toAad(userId));
  dekDecipher.setAuthTag(dekTag);
  return Buffer.concat([dekDecipher.update(dekCiphertext), dekDecipher.final()]);
}

@Injectable()
export class EncryptionService {
  decryptToken(credential: EncryptedCredential, userId: string): string {
    const kek = getKek();

    const dek = unwrapDek(credential, kek, userId);
    try {
      const tokenNonce = Buffer.from(credential.tokenNonce, 'base64');
      assertNonceLength(tokenNonce, 'tokenNonce');
      const encryptedTokenBuf = Buffer.from(credential.encryptedToken, 'base64');
      if (encryptedTokenBuf.length < TAG_LENGTH) {
        throw new Error('Malformed encryptedToken: too short');
      }
      const tokenCiphertext = encryptedTokenBuf.subarray(0, encryptedTokenBuf.length - TAG_LENGTH);
      const tokenTag = encryptedTokenBuf.subarray(encryptedTokenBuf.length - TAG_LENGTH);
      const tokenDecipher = createDecipheriv(ALGORITHM, dek, tokenNonce);
      tokenDecipher.setAAD(toAad(userId));
      tokenDecipher.setAuthTag(tokenTag);
      const plaintext = Buffer.concat([tokenDecipher.update(tokenCiphertext), tokenDecipher.final()]);

      return plaintext.toString('utf8');
    } finally {
      dek.fill(0);
    }
  }
}
