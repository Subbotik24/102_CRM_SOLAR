/**
 * AppStorageAdapter — wraps Replit App Storage (GCS) as a StorageAdapter.
 */
import type { StorageAdapter, StatResult } from "./interface";
import { LocalFsStorageAdapter } from "./localFsAdapter";
import {
  writeObjectStream,
  streamObjectToResponse,
  deleteObject,
  objectStorageClient,
} from "../lib/objectStorage";

function parsePath(key: string): { bucketName: string; objectName: string } {
  const withSlash = key.startsWith("/") ? key : `/${key}`;
  const parts = withSlash.slice(1).split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

export class AppStorageAdapter implements StorageAdapter {
  async put(
    key: string,
    stream: import("stream").Readable,
    mimeType: string
  ): Promise<void> {
    await writeObjectStream(key, stream, mimeType);
  }

  async stream(
    key: string,
    res: import("express").Response,
    filename: string
  ): Promise<void> {
    await streamObjectToResponse(key, res, filename);
  }

  async delete(key: string): Promise<void> {
    await deleteObject(key);
  }

  async stat(key: string): Promise<StatResult> {
    try {
      const { bucketName, objectName } = parsePath(key);
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (!exists) return { exists: false, sizeBytes: 0, mimeType: "" };
      const [meta] = await file.getMetadata();
      return {
        exists: true,
        sizeBytes: Number(meta.size ?? 0),
        mimeType: (meta.contentType as string) ?? "application/octet-stream",
      };
    } catch {
      return { exists: false, sizeBytes: 0, mimeType: "" };
    }
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const { bucketName: fromBucket, objectName: fromObj } = parsePath(fromKey);
    const { bucketName: toBucket, objectName: toObj } = parsePath(toKey);
    const srcFile = objectStorageClient.bucket(fromBucket).file(fromObj);
    const destFile = objectStorageClient.bucket(toBucket).file(toObj);
    await srcFile.copy(destFile);
    await srcFile.delete();
  }
}

// Replit App Storage (GCS) requires PRIVATE_OBJECT_DIR and the Replit sidecar.
// Outside Replit (local dev, CI, this deployment target) neither exists, so
// staging storage falls back to the local filesystem — same StorageAdapter
// contract, transparent to every caller.
export const appStorage: StorageAdapter = process.env.PRIVATE_OBJECT_DIR
  ? new AppStorageAdapter()
  : new LocalFsStorageAdapter();
