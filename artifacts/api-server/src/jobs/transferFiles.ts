/**
 * Background transfer job: App Storage (staging) → Dropbox (archive).
 *
 * - Triggered immediately after each upload (in-process)
 * - Also runs on a 2-minute interval
 * - Verifies content_hash after transfer
 * - Exponential backoff; 5 failures → status='failed'
 */
import { db, filesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { readObjectBuffer, deleteObject } from "../lib/objectStorage";
import { dropboxStorageAdapter } from "../storage/dropboxAdapter";
import { computeDropboxContentHashFromBuffer } from "../storage/contentHash";
import { isConnected } from "../storage/dropboxOAuth";

const MAX_RETRIES = 5;
let running = false;

/** Transfer a single file by ID. Called immediately after upload. */
export async function scheduleTransfer(fileId: string): Promise<void> {
  transferOne(fileId).catch(() => null);
}

async function transferOne(fileId: string): Promise<void> {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, fileId))
    .limit(1);

  if (!file || file.status !== "pending" || file.storageLocation !== "staging") return;

  const connected = await isConnected().catch(() => false);
  if (!connected) return; // No Dropbox credentials — leave as pending

  try {
    // Read from App Storage
    const buffer = await readObjectBuffer(file.storageKey);

    // Verify content hash before uploading
    const localHash = computeDropboxContentHashFromBuffer(buffer);
    if (localHash !== file.contentHash) {
      await markFailed(file.id, file.retryCount);
      return;
    }

    // Upload to Dropbox
    const dropboxPath = file.dropboxPath ?? `/${file.originalFilename}`;
    await dropboxStorageAdapter.uploadBuffer(dropboxPath, buffer);

    // Update DB: stored + remove staging object
    await db
      .update(filesTable)
      .set({
        status: "stored",
        storageLocation: "dropbox",
        dropboxPath,
        storageKey: dropboxPath,
        updatedAt: new Date(),
      })
      .where(eq(filesTable.id, file.id));

    // Delete from App Storage
    await deleteObject(file.storageKey).catch(() => null);
  } catch {
    const newRetryCount = file.retryCount + 1;
    if (newRetryCount >= MAX_RETRIES) {
      await markFailed(file.id, newRetryCount);
    } else {
      // Exponential backoff: schedule retry
      const delayMs = Math.min(Math.pow(2, newRetryCount) * 30_000, 600_000);
      await db
        .update(filesTable)
        .set({ retryCount: newRetryCount, updatedAt: new Date() })
        .where(eq(filesTable.id, file.id));
      setTimeout(() => transferOne(file.id).catch(() => null), delayMs);
    }
  }
}

async function markFailed(fileId: string, retryCount: number): Promise<void> {
  await db
    .update(filesTable)
    .set({ status: "failed", retryCount, updatedAt: new Date() })
    .where(eq(filesTable.id, fileId));
}

/** Run a batch transfer of all pending files. */
async function runBatch(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const pending = await db
      .select({ id: filesTable.id })
      .from(filesTable)
      .where(and(eq(filesTable.status, "pending"), eq(filesTable.storageLocation, "staging")))
      .limit(20);

    await Promise.allSettled(pending.map((f) => transferOne(f.id)));
  } finally {
    running = false;
  }
}

/** Start the 2-minute interval background job. Call once from server startup. */
export function startTransferJob(): void {
  setInterval(() => { runBatch().catch(() => null); }, 2 * 60 * 1000);
  // Run immediately at startup
  setTimeout(() => { runBatch().catch(() => null); }, 5_000);
}
