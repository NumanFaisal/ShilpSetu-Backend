import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from '../config/env';

/**
 * AES-256-GCM encryption for marketplace access/refresh tokens.
 * Never store marketplace credentials as plaintext.
 *
 * Format: <iv:12 bytes hex>:<authTag:16 bytes hex>:<ciphertext hex>
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(): Buffer {
  // Derive a 32-byte key from the env secret so any reasonably-sized value works.
  return createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY).digest();
}

/** Encrypts a plaintext string. Returns `null` for empty input. */
export function encryptToken(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypts a string produced by {@link encryptToken}. Returns `null` on failure/empty. */
export function decryptToken(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    const [ivHex, tagHex, dataHex] = enc.split(':');
    if (!ivHex || !tagHex || !dataHex) return null;
    const key = deriveKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
