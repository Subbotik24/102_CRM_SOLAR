/**
 * LocalFsStorageAdapter — filesystem-backed staging storage for local/dev use.
 *
 * Replit App Storage (GCS) requires PRIVATE_OBJECT_DIR and the Replit sidecar,
 * neither of which exist outside Replit. Without a local fallback, every
 * upload throws "PRIVATE_OBJECT_DIR not set" and the file never lands
 * anywhere. This adapter implements the same StorageAdapter contract against
 * the local disk so uploads work out of the box in any environment; it is
 * selected automatically by storage/appStorage.ts when PRIVATE_OBJECT_DIR is
 * unset.
 */
import { createWriteStream, createReadStream } from "fs";
import { mkdir, rm, stat as fsStat, readFile, writeFile, rename } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { Readable } from "stream";
import type { Response } from "express";
import type { StorageAdapter, StatResult } from "./interface";

// artifacts/api-server/src/storage/localFsAdapter.ts -> artifacts/api-server/.local-storage
const STORAGE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.local-storage"
);

function toFsPath(key: string): string {
  const relative = key.startsWith("/") ? key.slice(1) : key;
  return join(STORAGE_ROOT, relative);
}

function metaPath(fsPath: string): string {
  return `${fsPath}.meta.json`;
}

export class LocalFsStorageAdapter implements StorageAdapter {
  async put(key: string, stream: Readable, mimeType: string): Promise<void> {
    const fsPath = toFsPath(key);
    await mkdir(dirname(fsPath), { recursive: true });
    await new Promise<void>((resolvePut, reject) => {
      const writer = createWriteStream(fsPath);
      stream.pipe(writer);
      writer.on("finish", resolvePut);
      writer.on("error", reject);
      stream.on("error", reject);
    });
    const { size } = await fsStat(fsPath);
    await writeFile(metaPath(fsPath), JSON.stringify({ mimeType, sizeBytes: size }));
  }

  async stream(key: string, res: Response, filename: string): Promise<void> {
    const fsPath = toFsPath(key);
    const meta = await this.readMeta(fsPath);
    res.set("Content-Type", meta?.mimeType ?? "application/octet-stream");
    res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    await new Promise<void>((resolveStream, reject) => {
      const reader = createReadStream(fsPath);
      reader.pipe(res);
      reader.on("end", resolveStream);
      reader.on("error", reject);
    });
  }

  async delete(key: string): Promise<void> {
    const fsPath = toFsPath(key);
    await rm(fsPath, { force: true });
    await rm(metaPath(fsPath), { force: true });
  }

  async stat(key: string): Promise<StatResult> {
    const fsPath = toFsPath(key);
    try {
      const [stats, meta] = await Promise.all([fsStat(fsPath), this.readMeta(fsPath)]);
      return {
        exists: true,
        sizeBytes: stats.size,
        mimeType: meta?.mimeType ?? "application/octet-stream",
      };
    } catch {
      return { exists: false, sizeBytes: 0, mimeType: "" };
    }
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const fromPath = toFsPath(fromKey);
    const toPath = toFsPath(toKey);
    await mkdir(dirname(toPath), { recursive: true });
    await rename(fromPath, toPath);
    await rm(metaPath(fromPath), { force: true }).catch(() => null);
    const meta = await this.readMeta(fromPath);
    if (meta) await writeFile(metaPath(toPath), JSON.stringify(meta));
  }

  private async readMeta(fsPath: string): Promise<{ mimeType: string; sizeBytes: number } | null> {
    try {
      return JSON.parse(await readFile(metaPath(fsPath), "utf-8"));
    } catch {
      return null;
    }
  }
}
