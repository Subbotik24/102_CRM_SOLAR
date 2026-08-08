/**
 * Project log entry routes:
 *   GET    /projects/:id/log-entries         — list log entries
 *   POST   /projects/:id/log-entries         — create
 *   PATCH  /log-entries/:id                  — update
 *   DELETE /log-entries/:id                  — soft-delete
 */
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { handleError } from "./handleError";
import { createLogEntry, deleteLogEntry, listLogEntries, updateLogEntry } from "../services/journal";
import { z } from "zod";

const router = Router();

// ── List ──────────────────────────────────────────────────────────────────────

router.get("/projects/:id/log-entries", requireAuth, async (req, res) => {
  try {
    const entries = await listLogEntries(req.user!, String(req.params.id));
    res.json({ entries });
  } catch (e) {
    handleError(e, res);
  }
});

// ── Create ────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  entryType: z.enum(["decision", "milestone", "risk", "note"]).default("note"),
  title: z.string().min(1).max(500),
  bodyMd: z.string().default(""),
  occurredAt: z.string().datetime().optional(),
});

router.post("/projects/:id/log-entries", requireAuth, async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const entry = await createLogEntry(req.user!, {
      projectId: String(req.params.id),
      ...parsed.data,
    });
    res.status(201).json(entry);
  } catch (e) {
    handleError(e, res);
  }
});

// ── Update ────────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  bodyMd: z.string().optional(),
  entryType: z.enum(["decision", "milestone", "risk", "note"]).optional(),
  occurredAt: z.string().datetime().optional(),
});

router.patch("/log-entries/:id", requireAuth, async (req, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const entry = await updateLogEntry(req.user!, String(req.params.id), parsed.data);
    res.json(entry);
  } catch (e) {
    handleError(e, res);
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete("/log-entries/:id", requireAuth, async (req, res) => {
  try {
    await deleteLogEntry(req.user!, String(req.params.id));
    res.status(204).end();
  } catch (e) {
    handleError(e, res);
  }
});

export default router;
