/**
 * DropboxAdapter — uploads files to Dropbox using the files/upload or
 * upload session API. Files ≤150 MB use single-call upload; larger files
 * use chunked upload sessions with 8 MB chunks.
 *
 * Nothing outside server/storage/ imports the Dropbox API logic.
 */
import type { StorageAdapter, StatResult } from "./interface";
import { getAccessToken } from "./dropboxOAuth";

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB
const SIMPLE_LIMIT = 150 * 1024 * 1024; // 150 MiB

async function apiCall(
  url: string,
  args: object,
  body?: Buffer | Uint8Array,
  retries = 3
): Promise<unknown> {
  const token = await getAccessToken();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    let fetchBody: string | Buffer | Uint8Array | undefined;
    if (body) {
      headers["Content-Type"] = "application/octet-stream";
      headers["Dropbox-API-Arg"] = JSON.stringify(args);
      fetchBody = body;
    } else {
      headers["Content-Type"] = "application/json";
      fetchBody = JSON.stringify(args);
    }
    const res = await fetch(url, { method: "POST", headers, body: fetchBody });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
      const delay = Math.min(retryAfter * 1000, (2 ** attempt) * 2000);
      await sleep(delay);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new DropboxApiError(res.status, text);
    }
    return res.json();
  }
  throw new Error("Dropbox: max retries exceeded");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class DropboxApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string
  ) {
    super(`Dropbox API error ${statusCode}: ${body}`);
  }

  get isPathNotFound(): boolean {
    return this.body.includes("path/not_found") || this.body.includes("not_found");
  }
}

export class DropboxAdapter implements StorageAdapter {
  /**
   * Upload a buffer to Dropbox.
   * key = Dropbox path (e.g. "/Projects/abc_v01.pdf")
   */
  async put(
    key: string,
    stream: import("stream").Readable,
    _mimeType: string
  ): Promise<void> {
    // Collect stream into buffer (files ≤50 MB per upload endpoint limit)
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    await this.uploadBuffer(key, buffer);
  }

  async uploadBuffer(key: string, buffer: Buffer): Promise<void> {
    if (buffer.length <= SIMPLE_LIMIT) {
      await apiCall(
        "https://content.dropboxapi.com/2/files/upload",
        { path: key, mode: "add", autorename: false },
        buffer
      );
    } else {
      await this.chunkedUpload(key, buffer);
    }
  }

  private async chunkedUpload(key: string, buffer: Buffer): Promise<void> {
    const startRes = (await apiCall(
      "https://content.dropboxapi.com/2/files/upload_session/start",
      { close: false },
      buffer.subarray(0, CHUNK_SIZE)
    )) as { session_id: string };
    const sessionId = startRes.session_id;
    let offset = CHUNK_SIZE;

    while (offset + CHUNK_SIZE < buffer.length) {
      await apiCall(
        "https://content.dropboxapi.com/2/files/upload_session/append_v2",
        { cursor: { session_id: sessionId, offset }, close: false },
        buffer.subarray(offset, offset + CHUNK_SIZE)
      );
      offset += CHUNK_SIZE;
    }

    await apiCall(
      "https://content.dropboxapi.com/2/files/upload_session/finish",
      {
        cursor: { session_id: sessionId, offset },
        commit: { path: key, mode: "add", autorename: false },
      },
      buffer.subarray(offset)
    );
  }

  async stream(
    key: string,
    res: import("express").Response,
    filename: string
  ): Promise<void> {
    const token = await getAccessToken();
    const linkRes = await fetch(
      "https://api.dropboxapi.com/2/files/get_temporary_link",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: key }),
      }
    );
    if (!linkRes.ok) {
      const text = await linkRes.text();
      throw new DropboxApiError(linkRes.status, text);
    }
    const { link } = (await linkRes.json()) as { link: string };
    const fileRes = await fetch(link);
    if (!fileRes.ok) throw new Error("Failed to fetch Dropbox temporary link");

    res.set(
      "Content-Type",
      fileRes.headers.get("Content-Type") ?? "application/octet-stream"
    );
    res.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"`
    );
    const cl = fileRes.headers.get("Content-Length");
    if (cl) res.set("Content-Length", cl);

    const reader = fileRes.body?.getReader();
    if (!reader) throw new Error("No response body from Dropbox");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  }

  async delete(key: string): Promise<void> {
    await apiCall("https://api.dropboxapi.com/2/files/delete_v2", { path: key });
  }

  async stat(key: string): Promise<StatResult> {
    try {
      const meta = (await apiCall(
        "https://api.dropboxapi.com/2/files/get_metadata",
        { path: key }
      )) as { size: number };
      return { exists: true, sizeBytes: meta.size, mimeType: "" };
    } catch (e) {
      if (e instanceof DropboxApiError && e.isPathNotFound) {
        return { exists: false, sizeBytes: 0, mimeType: "" };
      }
      throw e;
    }
  }

  async move(_fromKey: string, _toKey: string): Promise<void> {
    throw new Error("DropboxAdapter.move not supported — use put+delete");
  }
}

export const dropboxAdapter = new DropboxAdapter();
