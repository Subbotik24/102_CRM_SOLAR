/**
 * AES-256-GCM encryption/decryption for secrets stored in the database.
 * Key must be 32+ character hex or ASCII string (first 32 bytes used).
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV (GCM standard)
const TAG_LENGTH = 16;

function deriveKey(rawKey: string): Buffer {
  // Derive a stable 32-byte key from the ENCRYPTION_KEY string
  return createHash("sha256").update(rawKey, "utf8").digest();
}

/**
 * Encrypt plaintext. Returns a base64 string: iv|ciphertext|tag
 */
export function encrypt(plaintext: string, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

/**
 * Decrypt a base64 string produced by encrypt().
 */
export function decrypt(ciphertext: string, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}
