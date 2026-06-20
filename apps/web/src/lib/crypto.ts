import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

function getKek(): Buffer {
  const kek = process.env.CREDENTIAL_ENCRYPTION_KEK;
  if (!kek || !/^[0-9a-f]{64}$/i.test(kek)) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEK must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32',
    );
  }
  return Buffer.from(kek, 'hex');
}

export interface EncryptedCredential {
  encryptedDek: string;
  dekNonce: string;
  encryptedToken: string;
  tokenNonce: string;
}

export function encryptToken(plaintext: string): EncryptedCredential {
  const kek = getKek();

  const dek = randomBytes(32);

  const dekNonce = randomBytes(NONCE_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, kek, dekNonce);
  const encryptedDekBody = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();
  const encryptedDek = Buffer.concat([encryptedDekBody, dekTag]).toString('base64');

  const tokenNonce = randomBytes(NONCE_LENGTH);
  const tokenCipher = createCipheriv(ALGORITHM, dek, tokenNonce);
  const encryptedTokenBody = Buffer.concat([
    tokenCipher.update(Buffer.from(plaintext, 'utf8')),
    tokenCipher.final(),
  ]);
  const tokenTag = tokenCipher.getAuthTag();
  const encryptedToken = Buffer.concat([encryptedTokenBody, tokenTag]).toString('base64');

  return {
    encryptedDek,
    dekNonce: dekNonce.toString('base64'),
    encryptedToken,
    tokenNonce: tokenNonce.toString('base64'),
  };
}

export function decryptToken(credential: EncryptedCredential): string {
  const kek = getKek();

  const dekNonce = Buffer.from(credential.dekNonce, 'base64');
  const encryptedDekBuf = Buffer.from(credential.encryptedDek, 'base64');
  if (encryptedDekBuf.length < TAG_LENGTH) {
    throw new Error('Malformed encryptedDek: too short');
  }
  const dekCiphertext = encryptedDekBuf.subarray(0, encryptedDekBuf.length - TAG_LENGTH);
  const dekTag = encryptedDekBuf.subarray(encryptedDekBuf.length - TAG_LENGTH);
  const dekDecipher = createDecipheriv(ALGORITHM, kek, dekNonce);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([dekDecipher.update(dekCiphertext), dekDecipher.final()]);

  const tokenNonce = Buffer.from(credential.tokenNonce, 'base64');
  const encryptedTokenBuf = Buffer.from(credential.encryptedToken, 'base64');
  if (encryptedTokenBuf.length < TAG_LENGTH) {
    throw new Error('Malformed encryptedToken: too short');
  }
  const tokenCiphertext = encryptedTokenBuf.subarray(0, encryptedTokenBuf.length - TAG_LENGTH);
  const tokenTag = encryptedTokenBuf.subarray(encryptedTokenBuf.length - TAG_LENGTH);
  const tokenDecipher = createDecipheriv(ALGORITHM, dek, tokenNonce);
  tokenDecipher.setAuthTag(tokenTag);
  const plaintext = Buffer.concat([tokenDecipher.update(tokenCiphertext), tokenDecipher.final()]);

  return plaintext.toString('utf8');
}
