/**
 * Dropbox content hash algorithm.
 *
 * Algorithm:
 *   1. Split file into 4 MiB (4 * 1024 * 1024 byte) blocks.
 *   2. SHA-256 each block.
 *   3. Concatenate all block digests (raw bytes).
 *   4. SHA-256 the concatenation.
 *   5. Hex-encode the final digest.
 *
 * Reference: https://www.dropbox.com/developers/reference/content-hash
 */
import { createHash } from "crypto";

const BLOCK_SIZE = 4 * 1024 * 1024; // 4 MiB

/**
 * Compute both SHA-256 (for dedup) and Dropbox content hash from a single
 * pass over the buffer. Returns hex strings.
 */
export function computeHashesFromBuffer(
  buffer: Buffer
): { sha256: string; contentHash: string } {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const contentHash = computeDropboxContentHashFromBuffer(buffer);
  return { sha256, contentHash };
}

export function computeDropboxContentHashFromBuffer(buffer: Buffer): string {
  const blockDigests: Buffer[] = [];
  for (let offset = 0; offset < buffer.length || offset === 0; offset += BLOCK_SIZE) {
    const block = buffer.subarray(offset, offset + BLOCK_SIZE);
    if (block.length === 0) break;
    blockDigests.push(createHash("sha256").update(block).digest());
  }
  const combined = Buffer.concat(blockDigests);
  return createHash("sha256").update(combined).digest("hex");
}

/**
 * Verify a buffer's content hash matches the stored one.
 */
export function verifyContentHash(buffer: Buffer, expected: string): boolean {
  return computeDropboxContentHashFromBuffer(buffer) === expected;
}
