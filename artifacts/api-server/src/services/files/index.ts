/**
 * File service — upload, list, download, versioning.
 *
 * Access-control model
 * ─────────────────────
 * Admin / Manager   — org-wide read/write (no membership check)
 * Member            — must be a member of the project owning the entity
 * Guest             — must be a member of the project AND file.visibility='external'
 */
import { randomUUID } from "crypto";
import {
  db, filesTable,
  tasksTable, deletionRequestsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import type { User, FileRecord } from "@workspace/db";
import { authorize, ForbiddenError } from "../access";
import { requireProjectAccess } from "../access/projectAccess";
import { appStorage } from "../../storage/appStorage";
import { allocateObjectKey } from "../../lib/objectStorage";
import { computeHashesFromBuffer } from "../../storage/contentHash";
import { env } from "../../lib/env";
import { scheduleTransfer } from "../../jobs/transferFiles";
import { logger } from "../../lib/logger";
import { emitActivity } from "../activity";

export { type FileRecord };

export type PendingDeletion = { id: string; requestedById: string };
export type FileRecordWithPending = FileRecord & { pendingDeletion: PendingDeletion | null };

/** Bulk-lookup pending deletion requests for a set of files. */
async function getPendingDeletionsFor(fileIds: string[]): Promise<Map<string, PendingDeletion>> {
  if (fileIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: deletionRequestsTable.id,
      entityId: deletionRequestsTable.entityId,
      requestedById: deletionRequestsTable.requestedById,
    })
    .from(deletionRequestsTable)
    .where(
      and(
        eq(deletionRequestsTable.entityType, "file"),
        eq(deletionRequestsTable.status, "pending"),
        inArray(deletionRequestsTable.entityId, fileIds)
      )
    );
  return new Map(rows.map((r) => [r.entityId, { id: r.id, requestedById: r.requestedById }]));
}

const ALLOWED_MIMES = new Set(
  env.FILE_MIME_ALLOWLIST.split(",").map((m) => m.trim()).filter(Boolean)
);
const MAX_BYTES = env.FILE_MAX_BYTES;

export class FileTooLargeError extends Error {
  constructor(limit: number) {
    super(`File exceeds maximum size of ${limit} bytes`);
    this.name = "FileTooLargeError";
  }
}

export class MimeNotAllowedError extends Error {
  constructor(mime: string) {
    super(`MIME type not allowed: ${mime}`);
    this.name = "MimeNotAllowedError";
  }
}

// ── Membership helpers ────────────────────────────────────────────────────────

/**
 * Resolve the project ID that "owns" an entity.
 * Returns null for unknown entity types.
 */
export async function resolveProjectId(
  entityType: string,
  entityId: string
): Promise<string | null> {
  if (entityType === "project") return entityId;
  if (entityType === "task") {
    const [task] = await db
      .select({ projectId: tasksTable.projectId })
      .from(tasksTable)
      .where(eq(tasksTable.id, entityId))
      .limit(1);
    return task?.projectId ?? null;
  }
  return null;
}

/**
 * Assert that actor is a member of projectId.
 * Admins and managers have org-wide access and skip the membership check.
 * Throws ForbiddenError for member/guest users who are not project members.
 */
async function assertProjectMembership(
  actor: User,
  projectId: string,
  action: "file:upload" | "file:download",
  visibility?: "internal" | "external",
): Promise<void> {
  await requireProjectAccess(actor, action, projectId, { visibility });
}

// ── Upload ────────────────────────────────────────────────────────────────────

/**
 * Handle a file upload:
 *  1. Validate mime + size
 *  2. Validate actor membership (members/guests must belong to the project)
 *  3. Compute SHA-256 + content hash
 *  4. Write to App Storage (staging)
 *  5. Insert DB row (status=pending)
 *  6. Fire background transfer
 */
export async function uploadFile(
  actor: User,
  {
    filename,
    mimeType,
    buffer,
    entityType,
    entityId,
    visibility = "internal",
    documentGroupId,
  }: {
    filename: string;
    mimeType: string;
    buffer: Buffer;
    entityType: string;
    entityId: string;
    visibility?: "internal" | "external";
    documentGroupId?: string;
  }
): Promise<FileRecord> {
  authorize(actor, "file:upload");

  // Guests can only upload external-visibility files
  if (actor.role === "guest") {
    visibility = "external";
  }

  if (!ALLOWED_MIMES.has(mimeType)) throw new MimeNotAllowedError(mimeType);
  if (buffer.length > MAX_BYTES) throw new FileTooLargeError(MAX_BYTES);

  // Membership check
  const projectId = await resolveProjectId(entityType, entityId);
  if (!projectId) throw new ForbiddenError("Unknown entity type");
  await assertProjectMembership(actor, projectId, "file:upload", visibility);

  const { sha256, contentHash } = computeHashesFromBuffer(buffer);

  // Determine versioning
  let versionNo = 1;
  const groupId = documentGroupId ?? randomUUID();

  if (documentGroupId) {
    const [latest] = await db
      .select({ versionNo: filesTable.versionNo })
      .from(filesTable)
      .where(eq(filesTable.documentGroupId, documentGroupId))
      .orderBy(desc(filesTable.versionNo))
      .limit(1);
    if (latest) {
      versionNo = latest.versionNo + 1;
    }
  }

  // Build a globally-unique Dropbox path.
  // Pattern: /pds/{documentGroupId}/v{nn}/{original-filename}
  // The documentGroupId UUID guarantees uniqueness across projects/entities;
  // versionNo is unique within a group, so the full path is collision-free.
  const dropboxPath = `/pds/${groupId}/v${String(versionNo).padStart(2, "0")}/${filename}`;

  // Write to App Storage
  const { Readable } = await import("stream");
  const storageKey = allocateObjectKey("files");
  await appStorage.put(storageKey, Readable.from(buffer), mimeType);

  // Insert DB row
  let file: FileRecord;
  try {
    file = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(filesTable)
        .values({
          originalFilename: filename,
          mimeType,
          sizeBytes: buffer.length,
          sha256,
          contentHash,
          status: "pending",
          storageLocation: "staging",
          storageKey,
          dropboxPath,
          versionNo,
          documentGroupId: groupId,
          entityType,
          entityId,
          uploaderId: actor.id,
          visibility,
        })
        .returning();
      await emitActivity(tx, {
        projectId,
        entityType: "file",
        entityId: created.id,
        actorId: actor.id,
        eventType: versionNo === 1 ? "file.uploaded" : "file.version_added",
        payload: { filename, mimeType, versionNo, entityType, entityId },
      });
      return created;
    });
  } catch (error) {
    // Object storage is outside PostgreSQL. A failed database transaction must
    // not leave staging content around indefinitely.
    await appStorage.delete(storageKey).catch((cleanupError) => {
      logger.warn({ err: cleanupError, storageKey }, "Could not clean up file after failed database transaction");
    });
    throw error;
  }

  // Trigger background transfer (non-blocking)
  scheduleTransfer(file.id).catch(() => null);

  return file;
}

// ── List ──────────────────────────────────────────────────────────────────────

/** List files for an entity. Membership-scoped; guests see only external. */
export async function listFiles(
  actor: User,
  entityType: string,
  entityId: string
): Promise<FileRecordWithPending[]> {
  // Role-level gate first
  // Membership check (members and guests)
  const projectId = await resolveProjectId(entityType, entityId);
  if (!projectId) return [];
  await assertProjectMembership(actor, projectId, "file:download", actor.role === "guest" ? "external" : undefined);

  const conditions = [
    eq(filesTable.entityType, entityType),
    eq(filesTable.entityId, entityId),
  ];
  if (actor.role === "guest") {
    conditions.push(eq(filesTable.visibility, "external"));
  }

  const rows = await db
    .select()
    .from(filesTable)
    .where(and(...conditions))
    .orderBy(desc(filesTable.createdAt));

  const pending = await getPendingDeletionsFor(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, pendingDeletion: pending.get(r.id) ?? null }));
}

// ── Versions ──────────────────────────────────────────────────────────────────

/** List all versions of a document group. Membership-scoped. */
export async function listVersions(
  actor: User,
  documentGroupId: string
): Promise<FileRecordWithPending[]> {
  // Find one representative file to derive the owning entity
  const [rep] = await db
    .select({
      entityType: filesTable.entityType,
      entityId: filesTable.entityId,
    })
    .from(filesTable)
    .where(eq(filesTable.documentGroupId, documentGroupId))
    .limit(1);

  if (!rep) return [];

  const projectId = await resolveProjectId(rep.entityType, rep.entityId);
  if (!projectId) return [];
  await assertProjectMembership(actor, projectId, "file:download", actor.role === "guest" ? "external" : undefined);

  const rows = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.documentGroupId, documentGroupId))
    .orderBy(desc(filesTable.versionNo));

  const pending = await getPendingDeletionsFor(rows.map((r) => r.id));
  const decorated = rows.map((r) => ({ ...r, pendingDeletion: pending.get(r.id) ?? null }));

  // Guests only see external
  return actor.role === "guest"
    ? decorated.filter((r) => r.visibility === "external")
    : decorated;
}

// ── Single file ───────────────────────────────────────────────────────────────

/** Get a single file record, checking membership and visibility. */
export async function getFile(
  actor: User,
  fileId: string
): Promise<FileRecord | null> {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, fileId))
    .limit(1);

  if (!file) return null;

  // Guests may only access external files
  if (actor.role === "guest" && file.visibility !== "external") return null;

  // Membership check
  const projectId = await resolveProjectId(file.entityType, file.entityId);
  if (!projectId) return null;
  try {
    await assertProjectMembership(actor, projectId, "file:download", file.visibility);
  } catch {
    return null; // Treat membership failure as not-found to avoid entity enumeration
  }

  return file;
}

// ── Mark missing ──────────────────────────────────────────────────────────────

/** Mark a file as missing (called when Dropbox returns path/not_found). */
export async function markFileMissing(fileId: string): Promise<void> {
  await db
    .update(filesTable)
    .set({ status: "missing", updatedAt: new Date() })
    .where(eq(filesTable.id, fileId));
}

// ── Delete ───────────────────────────────────────────────────────────────────

/**
 * Permanently delete a file: removes the stored object (if still in
 * staging) and the DB row. Caller is responsible for authorization —
 * this is invoked either directly by an admin or after a deletion
 * request has been approved.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const [file] = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, fileId))
    .limit(1);
  if (!file) return;

  const projectId = await resolveProjectId(file.entityType, file.entityId);
  await db.transaction(async (tx) => {
    await tx.delete(filesTable).where(eq(filesTable.id, fileId));
    await emitActivity(tx, {
      projectId,
      entityType: "file",
      entityId: file.id,
      actorId: file.uploaderId,
      eventType: "file.deleted",
      payload: { filename: file.originalFilename, entityType: file.entityType, entityId: file.entityId },
    });
  });

  if (file.storageLocation === "staging") {
    await appStorage.delete(file.storageKey).catch((error) => {
      logger.warn({ err: error, storageKey: file.storageKey }, "Could not remove deleted staging object");
    });
  }
}
