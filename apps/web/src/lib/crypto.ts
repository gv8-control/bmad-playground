import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const DEK_LENGTH = 32;

export function parseKekHex(value: string, label: string): Buffer {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(
      `${label} must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32`,
    );
  }
  return Buffer.from(value, 'hex');
}

function getKek(): Buffer {
  return parseKekHex(
    process.env.CREDENTIAL_ENCRYPTION_KEK ?? '',
    'CREDENTIAL_ENCRYPTION_KEK',
  );
}

/**
 * Deterministic, non-reversible fingerprint identifying which KEK wrapped a
 * row's DEK — first 16 hex chars of sha256(kek). Stored alongside the row
 * (`OAuthCredential.kekId`) so rotation can select rows by exact fingerprint
 * match instead of trial-decryption. Not a secret: knowing the fingerprint
 * does not help an attacker recover the KEK.
 */
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

function wrapDek(
  dek: Buffer,
  kek: Buffer,
  userId: string,
): Pick<EncryptedCredential, 'encryptedDek' | 'dekNonce' | 'kekId'> {
  const dekNonce = randomBytes(NONCE_LENGTH);
  const dekCipher = createCipheriv(ALGORITHM, kek, dekNonce);
  dekCipher.setAAD(toAad(userId));
  const encryptedDekBody = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();
  return {
    encryptedDek: Buffer.concat([encryptedDekBody, dekTag]).toString('base64'),
    dekNonce: dekNonce.toString('base64'),
    kekId: computeKekId(kek),
  };
}

/**
 * Unwraps the per-user DEK from a credential using the given KEK.
 * The narrowed parameter type keeps token fields out of reach — this helper
 * can never see, let alone decrypt, the OAuth token itself.
 *
 * `userId` is bound as GCM additional authenticated data (AAD): it must match
 * the userId supplied at wrap time or authentication fails closed. This
 * prevents a ciphertext-transplant attack where another user's
 * {encryptedDek, dekNonce} tuple is copied into this row and would otherwise
 * decrypt cleanly.
 */
export function unwrapDek(
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

/**
 * Re-wraps a credential's DEK under a new KEK (KEK rotation, Story 1.9).
 * The token ciphertext is untouched; only the DEK is transiently in memory
 * and is zeroed before returning. A FRESH nonce is always generated — GCM
 * nonce reuse under the new key would be a critical defect. `userId` is the
 * AAD bound at both unwrap and re-wrap time — it never changes ownership.
 */
export function rewrapDek(
  credential: Pick<EncryptedCredential, 'encryptedDek' | 'dekNonce'>,
  oldKek: Buffer,
  newKek: Buffer,
  userId: string,
): Pick<EncryptedCredential, 'encryptedDek' | 'dekNonce' | 'kekId'> {
  const dek = unwrapDek(credential, oldKek, userId);
  try {
    return wrapDek(dek, newKek, userId);
  } finally {
    dek.fill(0);
  }
}

export function encryptToken(plaintext: string, userId: string): EncryptedCredential {
  const kek = getKek();

  const dek = randomBytes(32);
  try {
    const { encryptedDek, dekNonce, kekId } = wrapDek(dek, kek, userId);

    const tokenNonce = randomBytes(NONCE_LENGTH);
    const tokenCipher = createCipheriv(ALGORITHM, dek, tokenNonce);
    tokenCipher.setAAD(toAad(userId));
    const encryptedTokenBody = Buffer.concat([
      tokenCipher.update(Buffer.from(plaintext, 'utf8')),
      tokenCipher.final(),
    ]);
    const tokenTag = tokenCipher.getAuthTag();
    const encryptedToken = Buffer.concat([encryptedTokenBody, tokenTag]).toString('base64');

    return {
      encryptedDek,
      dekNonce,
      encryptedToken,
      tokenNonce: tokenNonce.toString('base64'),
      kekId,
    };
  } finally {
    dek.fill(0);
  }
}

export function decryptToken(credential: EncryptedCredential, userId: string): string {
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
