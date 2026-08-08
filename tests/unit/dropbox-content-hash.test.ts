/**
 * Unit tests for Dropbox content hash algorithm.
 *
 * Reference values computed independently using the Dropbox spec:
 * https://www.dropbox.com/developers/reference/content-hash
 *
 * A file smaller than 4 MiB has exactly one block, so:
 *   content_hash = SHA256(SHA256(file_bytes))
 *
 * We also test the multi-block case with a synthetic 9-MiB file.
 */
import { createHash } from "crypto";
import {
  computeDropboxContentHashFromBuffer,
  computeHashesFromBuffer,
} from "../../artifacts/api-server/src/storage/contentHash";

const BLOCK_SIZE = 4 * 1024 * 1024; // 4 MiB

function expectedHash(buffer: Buffer): string {
  const blockDigests: Buffer[] = [];
  for (let offset = 0; offset < buffer.length || offset === 0; offset += BLOCK_SIZE) {
    const block = buffer.subarray(offset, offset + BLOCK_SIZE);
    if (block.length === 0) break;
    blockDigests.push(createHash("sha256").update(block).digest());
  }
  return createHash("sha256").update(Buffer.concat(blockDigests)).digest("hex");
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

console.log("\n=== Dropbox content hash unit tests ===\n");

// ── Test 1: empty buffer ────────────────────────────────────────────────────
{
  const buf = Buffer.alloc(0);
  const result = computeDropboxContentHashFromBuffer(buf);
  const expected = expectedHash(buf);
  assert(result === expected, `Empty buffer: ${result}`);
}

// ── Test 2: small file (< 4 MiB) — single block ────────────────────────────
{
  const buf = Buffer.from("Hello, Dropbox content hash algorithm!", "utf8");
  const result = computeDropboxContentHashFromBuffer(buf);
  const expected = expectedHash(buf);
  assert(result === expected, `Small file matches expected: ${result}`);

  // Also verify: single-block content hash = SHA256(SHA256(bytes))
  const singleBlockRef = createHash("sha256")
    .update(createHash("sha256").update(buf).digest())
    .digest("hex");
  assert(result === singleBlockRef, "Single block = SHA256(SHA256(bytes))");
}

// ── Test 3: exactly 4 MiB — still one block ────────────────────────────────
{
  const buf = Buffer.alloc(BLOCK_SIZE, 0xab);
  const result = computeDropboxContentHashFromBuffer(buf);
  const expected = expectedHash(buf);
  assert(result === expected, "Exactly 4 MiB matches expected");
}

// ── Test 4: 4 MiB + 1 byte — two blocks ───────────────────────────────────
{
  const buf = Buffer.alloc(BLOCK_SIZE + 1, 0xcd);
  const result = computeDropboxContentHashFromBuffer(buf);
  const expected = expectedHash(buf);
  assert(result === expected, "4 MiB + 1 byte (two blocks) matches expected");
}

// ── Test 5: 9 MiB — three blocks ──────────────────────────────────────────
{
  const buf = Buffer.alloc(9 * 1024 * 1024, 0x77);
  const result = computeDropboxContentHashFromBuffer(buf);
  const expected = expectedHash(buf);
  assert(result === expected, "9 MiB (three blocks) matches expected");
}

// ── Test 6: computeHashesFromBuffer returns correct SHA-256 + content hash ─
{
  const buf = Buffer.from("PDS Integration Test File", "utf8");
  const { sha256, contentHash } = computeHashesFromBuffer(buf);
  const expectedSha256 = createHash("sha256").update(buf).digest("hex");
  const expectedContentHash = expectedHash(buf);
  assert(sha256 === expectedSha256, `SHA-256 is correct: ${sha256}`);
  assert(contentHash === expectedContentHash, `Content hash is correct: ${contentHash}`);
}

console.log("\n=== All content hash tests passed ===\n");
