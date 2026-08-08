/**
 * Thin GCS wrapper for Replit App Storage.
 * Uses the Replit sidecar for authentication — do not modify the credentials block.
 */
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR ?? "";
  if (dir) return dir.endsWith("/") ? dir.slice(0, -1) : dir;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PRIVATE_OBJECT_DIR not set");
  }
  // Outside production, storage/appStorage.ts selects a local filesystem
  // adapter instead of this GCS client, so this path is never resolved
  // against a real bucket — it only needs to be a stable key prefix.
  return "/local-dev-storage";
}

function parsePath(fullPath: string): { bucketName: string; objectName: string } {
  // fullPath: /bucket/object/name
  const withSlash = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = withSlash.slice(1).split("/");
  if (parts.length < 2) throw new Error(`Invalid object path: ${fullPath}`);
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

/** Allocate a new GCS object key and return the storage key string. */
export function allocateObjectKey(prefix = "uploads"): string {
  const dir = getPrivateObjectDir();
  return `${dir}/${prefix}/${randomUUID()}`;
}

/** Write a Readable stream to GCS. Returns the storage key. */
export async function writeObjectStream(
  key: string,
  stream: Readable,
  mimeType: string
): Promise<void> {
  const { bucketName, objectName } = parsePath(key);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await new Promise<void>((resolve, reject) => {
    const writer = file.createWriteStream({ contentType: mimeType, resumable: false });
    stream.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    stream.on("error", reject);
  });
}

/** Stream a GCS object to an Express response. */
export async function streamObjectToResponse(
  key: string,
  res: import("express").Response,
  filename: string
): Promise<void> {
  const { bucketName, objectName } = parsePath(key);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [metadata] = await file.getMetadata();
  res.set("Content-Type", (metadata.contentType as string) ?? "application/octet-stream");
  res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  if (metadata.size) res.set("Content-Length", String(metadata.size));
  await new Promise<void>((resolve, reject) => {
    const reader = file.createReadStream();
    reader.pipe(res);
    reader.on("end", resolve);
    reader.on("error", reject);
  });
}

/** Delete a GCS object (best-effort). */
export async function deleteObject(key: string): Promise<void> {
  try {
    const { bucketName, objectName } = parsePath(key);
    const bucket = objectStorageClient.bucket(bucketName);
    await bucket.file(objectName).delete();
  } catch {
    // Ignore — object may already be gone
  }
}

/** Check if a GCS object exists. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    const { bucketName, objectName } = parsePath(key);
    const [exists] = await objectStorageClient.bucket(bucketName).file(objectName).exists();
    return exists;
  } catch {
    return false;
  }
}

/** Read a GCS object into a Buffer (small files only). */
export async function readObjectBuffer(key: string): Promise<Buffer> {
  const { bucketName, objectName } = parsePath(key);
  const [contents] = await objectStorageClient.bucket(bucketName).file(objectName).download();
  return contents;
}

/** Write a Buffer to GCS. */
export async function writeObjectBuffer(
  key: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const readable = Readable.from(buffer);
  await writeObjectStream(key, readable, mimeType);
}
