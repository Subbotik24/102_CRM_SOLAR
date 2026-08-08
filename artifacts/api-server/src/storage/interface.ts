/**
 * StorageAdapter — abstract interface for staging (App Storage) and archive (Dropbox).
 * Nothing outside server/storage/ may import the Dropbox SDK.
 */
export interface StatResult {
  sizeBytes: number;
  mimeType: string;
  exists: boolean;
}

export interface StorageAdapter {
  /** Store a file from a Node Readable stream. Returns an opaque storage key. */
  put(
    key: string,
    stream: import("stream").Readable,
    mimeType: string,
    sizeHint?: number
  ): Promise<void>;

  /** Pipe the stored object to an Express response. */
  stream(
    key: string,
    res: import("express").Response,
    filename: string
  ): Promise<void>;

  /** Delete a stored object. Best-effort. */
  delete(key: string): Promise<void>;

  /** Check metadata. Returns exists:false if not found. */
  stat(key: string): Promise<StatResult>;

  /** Move a stored object to a new key (within the same adapter). */
  move(fromKey: string, toKey: string): Promise<void>;
}
