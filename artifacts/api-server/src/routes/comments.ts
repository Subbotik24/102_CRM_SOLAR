import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { handleError } from "./handleError";
import {
  listComments,
  addComment,
  editComment,
  deleteComment,
  addCommentSchema,
  editCommentSchema,
} from "../services/comments";

const router = Router();

// GET /comments?entityType=&entityId=
router.get("/comments", requireAuth, async (req, res): Promise<void> => {
  try {
    const { entityType, entityId } = req.query;
    if (!entityType || !entityId || typeof entityType !== "string" || typeof entityId !== "string") {
      res.status(400).json({ error: "entityType and entityId are required" });
      return;
    }
    const comments = await listComments(req.user!, entityType, entityId);
    res.json({ comments });
  } catch (err) {
    handleError(err, res);
  }
});

// POST /comments
router.post("/comments", requireAuth, async (req, res): Promise<void> => {
  const parsed = addCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const comment = await addComment(req.user!, parsed.data);
    res.status(201).json(comment);
  } catch (err) {
    handleError(err, res);
  }
});

// PATCH /comments/:id
router.patch("/comments/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = editCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const comment = await editComment(req.user!, req.params.id as string, parsed.data);
    if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
    res.json(comment);
  } catch (err) {
    handleError(err, res);
  }
});

// DELETE /comments/:id
router.delete("/comments/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    await deleteComment(req.user!, req.params.id as string);
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
