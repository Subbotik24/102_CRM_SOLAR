/**
 * File routes:
 *   GET    /files?entityType=&entityId=   — list files
 *   POST   /files                         — upload (multipart/form-data)
 *   DELETE /files/:id                     — delete (or request deletion)
 *   GET    /files/:id/download            — proxy download
 *   GET    /files/:id/versions            — list versions of a document group
 *   GET    /admin/dropbox/status          — connection status
 *   GET    /admin/dropbox/connect         — initiate OAuth
 *   GET    /admin/dropbox/callback        — OAuth callback
 *   DELETE /admin/dropbox/disconnect      — revoke token
 */
import { Router } from "express";
import busboy from "busboy";
import { db, filesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import { handleError } from "./handleError";
import { authorize } from "../services/access";
import {
  uploadFile,
  listFiles,
  listVersions,
  getFile,
  markFileMissing,
  deleteFile,
  resolveProjectId,
  FileTooLargeError,
  MimeNotAllowedError,
} from "../services/files";
import { createDeletionRequest } from "../services/deletionRequests";
import { appStorage } from "../storage/appStorage";
import { dropboxAdapter, DropboxApiError } from "../storage/dropboxAdapter";
import {
  buildAuthorizationUrl,
  exchangeCode,
  disconnect,
  isConnected,
  getAccountEmail,
  getSpaceUsage,
} from "../storage/dropboxOAuth";
import { env } from "../lib/env";
import { ServiceUnavailableError } from "../services/errors";
import { randomUUID } from "crypto";

const router = Router();

router.use(["/files", "/admin/dropbox"], (_req, res, next) => {
  if (!env.FILES_ENABLED) {
    handleError(new ServiceUnavailableError("The file module is temporarily unavailable", "feature_disabled"), res);
    return;
  }
  next();
});

// ── File list ────────────────────────────────────────────────────────────────

router.get("/files", requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.query as Record<string, string>;
    if (!entityType || !entityId) {
      return void res.status(400).json({ error: "entityType and entityId required" });
    }
    const files = await listFiles(req.user!, entityType, entityId);
    res.json({ files });
  } catch (e) {
    handleError(e, res);
  }
});

// ── Upload (multipart) ───────────────────────────────────────────────────────

router.post("/files", requireAuth, (req, res) => {
  const user = req.user!;
  const query = req.query as Record<string, string>;
  const { entityType, entityId, visibility, documentGroupId } = query;

  if (!entityType || !entityId) {
    return void res.status(400).json({ error: "entityType and entityId required" });
  }

  const bb = busboy({
    headers: req.headers,
    defParamCharset: "utf8",
    limits: { fileSize: env.FILE_MAX_BYTES + 1 },
  });

  let processed = false;
  let responded = false;

  bb.on("file", (_fieldname, fileStream, info) => {
    if (processed) { fileStream.resume(); return; }
    processed = true;

    const { filename, mimeType } = info;
    const chunks: Buffer[] = [];
    let tooBig = false;

    fileStream.on("data", (chunk: Buffer) => { chunks.push(chunk); });
    fileStream.on("limit", () => { tooBig = true; fileStream.resume(); });

    fileStream.on("end", async () => {
      responded = true;
      if (tooBig) {
        return void res.status(413).json({ error: `File exceeds ${env.FILE_MAX_BYTES} bytes` });
      }
      try {
        const buffer = Buffer.concat(chunks);
        const file = await uploadFile(user, {
          filename: filename || "unnamed",
          mimeType: mimeType || "application/octet-stream",
          buffer,
          entityType,
          entityId,
          visibility: (visibility as "internal" | "external") ?? "internal",
          documentGroupId: documentGroupId || undefined,
        });
        res.status(201).json(file);
      } catch (e) {
        if (e instanceof MimeNotAllowedError) {
          res.status(415).json({ error: (e as Error).message });
        } else if (e instanceof FileTooLargeError) {
          res.status(413).json({ error: (e as Error).message });
        } else {
          handleError(e, res);
        }
      }
    });
  });

  bb.on("finish", () => {
    // No file part was found in the multipart payload
    if (!responded) {
      res.status(400).json({ error: "No file part in request" });
    }
  });

  bb.on("error", (e: Error) => handleError(e, res));
  req.pipe(bb);
});

// ── Download proxy ───────────────────────────────────────────────────────────

router.get("/files/:id/download", requireAuth, async (req, res) => {
  try {
    const file = await getFile(req.user!, String(req.params.id));
    if (!file) return void res.status(404).json({ error: "File not found" });

    if (file.status === "missing") {
      return void res.status(410).json({ error: "File is no longer available" });
    }

    if (file.storageLocation === "staging") {
      await appStorage.stream(file.storageKey, res, file.originalFilename);
    } else {
      try {
        await dropboxAdapter.stream(
          file.dropboxPath ?? file.storageKey,
          res,
          file.originalFilename
        );
      } catch (e) {
        if (e instanceof DropboxApiError && e.isPathNotFound) {
          await markFileMissing(file.id);
          return void res.status(410).json({ error: "File not found in Dropbox" });
        }
        throw e;
      }
    }
  } catch (e) {
    handleError(e, res);
  }
});

// ── Delete ───────────────────────────────────────────────────────────────────

router.delete("/files/:id", requireAuth, async (req, res) => {
  try {
    const actor = req.user!;
    const file = await getFile(actor, String(req.params.id));
    if (!file) return void res.status(404).json({ error: "File not found" });

    if (actor.role === "admin") {
      await deleteFile(file.id);
      return void res.status(204).send();
    }

    authorize(actor, "file:upload");
    const projectId = await resolveProjectId(file.entityType, file.entityId);
    if (!projectId) return void res.status(404).json({ error: "File not found" });
    await createDeletionRequest(actor, "file", file.id, file.originalFilename, projectId);
    res.status(202).json({ status: "pending" });
  } catch (e) {
    handleError(e, res);
  }
});

// ── Version list ─────────────────────────────────────────────────────────────

router.get("/files/:id/versions", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({ documentGroupId: filesTable.documentGroupId })
      .from(filesTable)
      .where(eq(filesTable.id, String(req.params.id)))
      .limit(1);
    const fileRow = rows[0];
    if (!fileRow) return void res.status(404).json({ error: "File not found" });
    const versions = await listVersions(req.user!, fileRow.documentGroupId);
    res.json({ versions });
  } catch (e) {
    handleError(e, res);
  }
});

// ── Dropbox admin ─────────────────────────────────────────────────────────────

router.get("/admin/dropbox/status", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "admin" && user.role !== "manager") {
      return void res.status(403).json({ error: "Admin only" });
    }
    const connected = await isConnected();
    const email = connected ? await getAccountEmail() : "";
    const space = connected ? await getSpaceUsage() : null;
    res.json({ connected, email, space });
  } catch (e) {
    handleError(e, res);
  }
});

router.get("/admin/dropbox/connect", requireAuth, (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "admin") {
      return void res.status(403).json({ error: "Admin only" });
    }
    if (!env.DROPBOX_APP_KEY) {
      return void res.status(503).json({ error: "DROPBOX_APP_KEY not configured" });
    }
    const state = randomUUID();
    // Store OAuth state in session for CSRF verification
    (req.session as unknown as Record<string, unknown>).dropboxOAuthState = state;
    const url = buildAuthorizationUrl(state);
    res.redirect(url);
  } catch (e) {
    handleError(e, res);
  }
});

router.get("/admin/dropbox/callback", requireAuth, async (req, res) => {
  try {
    const { code, state } = req.query as Record<string, string>;
    const sess = req.session as unknown as Record<string, unknown>;
    const storedState = sess.dropboxOAuthState as string | undefined;
    if (!state || state !== storedState) {
      return void res.status(400).json({ error: "Invalid OAuth state" });
    }
    delete sess.dropboxOAuthState;

    await exchangeCode(code);
    const base = env.APP_URL ?? "";
    res.redirect(`${base}/admin/dropbox`);
  } catch (e) {
    handleError(e, res);
  }
});

router.delete("/admin/dropbox/disconnect", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "admin") {
      return void res.status(403).json({ error: "Admin only" });
    }
    await disconnect();
    res.status(204).end();
  } catch (e) {
    handleError(e, res);
  }
});

export default router;
